# Bell Pull Plugin Authoring

Plugins extend Bell Pull by pulling data from external sources and storing as memories. All plugins live in `src/plugins/<name>/index.ts` and are registered in `src/plugins/registry.ts`.

## Plugin Interface

```typescript
interface Plugin<TConfig = unknown> {
  name: string;
  displayName?: string;
  configSchema?: z.ZodSchema<TConfig>;
  oauth?: OAuthSetup;
  init?: (app: Hono<HonoEnv>, container: Container) => void;
  cronJobs?: CronJob[] | ((config: TConfig) => CronJob[]);
  settingsUI?: (config: TConfig, container: Container) => unknown;
}
```

## Config Schema Annotations

```typescript
import { secret, cron, managed } from "../../services/config-schema.ts";

// secret: renders as password field in UI
apiKey: secret(z.string().min(1))

// cron: marks as cron schedule field
syncSchedule: cron(z.string().default("0 8 * * *"))

// managed: hidden from UI, set programmatically (e.g., OAuth tokens)
accessToken: managed(z.string().optional())
```

---

## Type 1: RSS/API Polling Plugin

For services with public feeds or simple API keys. Uses cron jobs to fetch periodically.

```typescript
// src/plugins/letterboxd/index.ts
import * as z from "@zod/zod";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { appError } from "../../errors.ts";
import { cron } from "../../services/config-schema.ts";

const NAME = "my-plugin";

const configSchema = z.object({
  username: z.string().min(1),
  syncSchedule: cron(z.string().default("0 8 * * *")),
});

type MyConfig = z.infer<typeof configSchema>;

export const myPlugin: Plugin<MyConfig> = {
  name: NAME,
  displayName: "My Plugin",
  configSchema,
  cronJobs: (config) => [
    {
      name: `${NAME}-sync`,
      schedule: config?.syncSchedule ?? "0 8 * * *",
      run: (container, job) => {
        const { log, memory, plugins } = container;

        return plugins
          .getConfig<MyConfig>(NAME)
          .andThen((pluginConfig) => {
            if (!pluginConfig) {
              return errAsync(appError("plugin", `[${job.name}] Not configured`));
            }
            return okAsync(pluginConfig);
          })
          .andThen((pluginConfig) => {
            // Fetch data from external source
            return fetchData(pluginConfig.config.username)
              .andTee((items) => log.info`[${job.name}] Fetched ${items.length} items`)
              .andThen((items) =>
                ResultAsync.combine(
                  items.map((item) =>
                    memory.updateMemories({
                      memories: [{ date: item.date, text: item.text }],
                      editMemories: [],
                      deleteMemories: [],
                      response: "",
                    }, pluginConfig)
                  )
                ).map(() => ({ synced: items.length }))
              );
          });
      },
    },
  ],
};
```

---

## Type 2: OAuth Plugin

For services requiring OAuth (Google, Spotify, etc.). Uses Arctic.js library.

```typescript
// src/plugins/google-calendar/index.ts
import { Google } from "arctic";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Container, Plugin } from "../../types/index.ts";
import { appError } from "../../errors.ts";
import { refreshPluginToken, registerOAuthRoutes } from "../../services/oauth.ts";
import { cron, managed, secret } from "../../services/config-schema.ts";

const NAME = "google-calendar";

const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: secret(z.string().min(1)),
  syncSchedule: cron(z.string().default("0 */6 * * *")),
  // OAuth-managed fields (hidden from UI, set by OAuth flow)
  accessToken: managed(z.string().optional()),
  refreshToken: managed(z.string().optional()),
  tokenExpiresAt: managed(z.string().optional()),
});

type MyOAuthConfig = z.infer<typeof configSchema>;

// Extract OAuth setup as const for reuse in init and token refresh
const oauth = {
  createProvider: (clientId: string, clientSecret: string, redirectUri: string) =>
    new Google(clientId, clientSecret, redirectUri),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  // Optional: customize authorization URL (e.g., for refresh tokens)
  createAuthorizationURL: (provider, state, codeVerifier, scopes) => {
    const url = provider.createAuthorizationURL(state, codeVerifier, scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url;
  },
} as const;

const isTokenExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) return true;
  return DateTime.fromISO(expiresAt).minus({ minutes: 5 }) < DateTime.now();
};

const getValidToken = (
  container: Container,
  pluginConfig: PluginConfig<MyOAuthConfig>,
): ResultAsync<string, AppError> => {
  const { config } = pluginConfig;

  if (!config.accessToken) {
    return errAsync(appError("plugin", "Not authenticated"));
  }

  if (isTokenExpired(config.tokenExpiresAt)) {
    return refreshPluginToken(NAME, oauth, container).map((t) => t.accessToken);
  }

  return okAsync(config.accessToken);
};

export const myOAuthPlugin: Plugin<MyOAuthConfig> = {
  name: NAME,
  displayName: "Google Calendar",
  configSchema,
  oauth,
  init: (app, container) => {
    // Register OAuth routes: /oauth/{name}/authorize and /oauth/{name}/callback
    registerOAuthRoutes(app, NAME, oauth, container);
  },
  cronJobs: (config) => [
    {
      name: `${NAME}-sync`,
      schedule: config?.syncSchedule ?? "0 */6 * * *",
      run: (container, job) => {
        return container.plugins
          .getConfig<MyOAuthConfig>(NAME)
          .andThen((pluginConfig) => {
            if (!pluginConfig) {
              return errAsync(appError("plugin", `[${job.name}] Not configured`));
            }
            return getValidToken(container, pluginConfig)
              .andThen((accessToken) => fetchWithToken(accessToken))
              .andThen((data) => storeAsMemories(data, pluginConfig, container));
          });
      },
    },
  ],
};
```

---

## Type 3: Ingest Endpoint Plugin

For receiving data via HTTP POST (iOS Shortcuts, webhooks, etc.). Uses API key auth.

```typescript
// src/plugins/apple-health/index.ts
import * as z from "@zod/zod";
import { DateTime } from "luxon";
import { errAsync, okAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { appError } from "../../errors.ts";
import { secret } from "../../services/config-schema.ts";

const NAME = "apple-health";

const configSchema = z.object({
  apiKey: secret(z.string().min(1)),
});

type IngestConfig = z.infer<typeof configSchema>;

const payloadSchema = z.object({
  date: z.string().optional(),
  // ... your payload fields
});

export const ingestPlugin: Plugin<IngestConfig> = {
  name: NAME,
  displayName: "Apple Health",
  configSchema,
  init: (app, container) => {
    const { log, memory, plugins } = container;

    app.post(`/api/plugins/${NAME}/ingest`, async (c) => {
      const apiKey = c.req.header("x-api-key");
      const body = await c.req.json();

      return plugins
        .getConfig<IngestConfig>(NAME)
        .andThen((pluginConfig) => {
          if (!pluginConfig) {
            return errAsync(appError("plugin", "Not configured", 500));
          }
          if (!apiKey || apiKey !== pluginConfig.config.apiKey) {
            return errAsync(appError("auth", "Unauthorized", 401));
          }
          return okAsync(pluginConfig);
        })
        .andThen((pluginConfig) => {
          const parseResult = payloadSchema.safeParse(body);
          if (!parseResult.success) {
            return errAsync(appError("validation", "Invalid payload", 400));
          }
          return okAsync({ pluginConfig, data: parseResult.data });
        })
        .andThen(({ pluginConfig, data }) => {
          const date = data.date ?? DateTime.now().toISODate()!;
          const text = formatData(data);

          return memory
            .updateMemories({
              memories: [{ date, text }],
              editMemories: [],
              deleteMemories: [],
              response: "",
            }, pluginConfig)
            .map(() => ({ date, text }));
        })
        .match(
          (result) => {
            log.info`[${NAME}] Stored data for ${result.date}`;
            return c.json({ success: true, ...result });
          },
          (error) => {
            log.error`[${NAME}] ${error.message}`;
            const status = (error.context as number) ?? 500;
            return c.json({ error: error.message }, status);
          },
        );
    });
  },
  // Optional: show setup instructions in dashboard
  settingsUI: () => (
    <div class="custom-section">
      <h3>Setup</h3>
      <p>POST to <code>/api/plugins/{NAME}/ingest</code> with <code>x-api-key</code> header.</p>
    </div>
  ),
};
```

---

## Registering Plugins

Add to `src/plugins/registry.ts`:

```typescript
import { myPlugin } from "./my-plugin/index.ts";

export const plugins: Plugin<any>[] = [
  // ... existing plugins
  myPlugin,
];
```

---

## Key Patterns

1. **Always use neverthrow chains** - No throwing errors, use `errAsync`/`okAsync` and `.andThen()`
2. **Use Luxon for dates** - `DateTime.now()`, `DateTime.fromISO()`, `.plus()`, `.minus()`
3. **Config via plugins domain** - `container.plugins.getConfig<T>(NAME)`
4. **Store via memory domain** - `container.memory.updateMemories()`
5. **Status codes in errors** - `appError("type", "message", statusCode)` for HTTP responses
6. **Cron as function** - `cronJobs: (config) => [...]` to use config values in schedule
