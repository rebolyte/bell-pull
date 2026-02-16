---
name: write-bellpull-plugin
description: Use when authoring new plugins for Bell Pull, which pull/accept data from external sources and store them as memories.
---

# Bell Pull Plugin Authoring

Plugins extend Bell Pull by pulling data from external sources and storing as memories. All plugins live in `src/plugins/<name>/index.ts` and are registered in `src/plugins/registry.ts`.

Community plugins can import types and helpers from the SDK barrel: `import { type Plugin, cron, appError } from "bell-pull/plugin-sdk";`. In-tree plugins use relative imports.

- Each plugin has a `configSchema` Zod object which defines what goes in its `config` column in the DB.
  - This is used to to parse/validate what gets peristed and also auto-generate the admin UI. This is done by annotating certain properties in Zod so the string representation can be differentiated. The annotated config is converted to JSON schema for serialization.
- Each plugin has optional `oauth` property. As each plugin is initialized it should use our helper to register routes for actual flow endpoints.

## Plugin Interface

```typescript
interface Plugin<TConfig = unknown> {
  name: string;
  displayName?: string;
  configSchema?: z.ZodSchema<TConfig>;
  oauth?: OAuthSetup;
  init?: (apps: ServerApps, container: Container) => void;
  cronJobs?: CronJob[] | ((config: TConfig) => CronJob[]);
  onIngest?: (text: string) => Promise<string | null>;
  settingsUI?: (config: TConfig, container: Container) => unknown;
}

type CronJob = {
  name: string;
  schedule: string;
  fields?: string[]; // config field keys rendered inside this cron's fieldset
  run: (container: Container, job: CronJobRunContext) =>
    ResultAsync<Record<string, unknown> | null, AppError>;
};

// init receives both public and admin Hono apps
type ServerApps = {
  public: Hono<HonoEnv>;  // public-facing routes (webhooks, ingest endpoints)
  admin: Hono<HonoEnv>;   // dashboard routes
};
```

## Config Schema Annotations

```typescript
import { cron, hidden, managed, secret, textarea } from "../../services/config-schema.ts";

// secret: renders as password field in UI
apiKey: secret(z.string().min(1));

// cron: marks as cron schedule field, rendered inside cron fieldset
"my-plugin-sync-schedule": cron(z.string().default("0 8 * * *"));

// managed: hidden from UI, set programmatically (e.g., OAuth tokens)
accessToken: managed(z.string().optional());

// hidden: stored but not shown in UI
selectedItems: hidden(z.array(z.string()).default([]));

// textarea: large text input, optional description shown below
briefingPrompt: textarea(
  z.string().default("default prompt"),
  "Variables: {{memories}}, {{date}}",
);
```

## Cron Schedule Field Naming Convention

Cron schedule keys MUST follow the pattern `"${jobName}-schedule"`:

```typescript
const configSchema = z.object({
  "my-plugin-sync-schedule": cron(z.string().default("0 8 * * *")),
});

cronJobs: (config) => [{
  name: "my-plugin-sync",
  schedule: config?.["my-plugin-sync-schedule"] ?? "0 8 * * *",
  run: ...
}]
```

The cron runner resolves schedules via `config["${jobName}-schedule"]`. Each cron job also gets a per-cron enabled toggle in the admin UI, stored as `config["${jobName}-enabled"]` (boolean, defaults to `true`).

## Associating Config Fields with Cron Jobs

Use `fields` on a cron job to render config fields (especially textareas) inside the cron's fieldset in the admin UI:

```typescript
cronJobs: (config) => [{
  name: "my-plugin-sync",
  schedule: config?.["my-plugin-sync-schedule"] ?? "0 8 * * *",
  fields: ["syncPrompt"],  // these fields render inside the cron fieldset
  run: ...
}]
```

Fields listed in `fields` are removed from the top-level form and placed inside the cron's fieldset. They are also disabled when the cron is toggled off.

---

## Type 1: RSS/API Polling Plugin

For services with public feeds or simple API keys. Uses cron jobs to fetch periodically.

```typescript
// src/plugins/my-plugin/index.ts
import * as z from "@zod/zod";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { appError } from "../../errors.ts";
import { cron } from "../../services/config-schema.ts";

const NAME = "my-plugin";

const configSchema = z.object({
  username: z.string().min(1),
  "my-plugin-sync-schedule": cron(z.string().default("0 8 * * *")),
});

type MyConfig = z.infer<typeof configSchema>;

export const myPlugin: Plugin<MyConfig> = {
  name: NAME,
  displayName: "My Plugin",
  configSchema,
  cronJobs: (config) => [
    {
      name: `${NAME}-sync`,
      schedule: config?.["my-plugin-sync-schedule"] ?? "0 8 * * *",
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
            return fetchData(pluginConfig.config.username)
              .andTee((items) => log.info`[${job.name}] Fetched ${items.length} items`)
              .andThen((items) =>
                ResultAsync.combine(
                  items.map((item) =>
                    memory.updateMemories({
                      memories: [{ date: item.date, text: item.text }],
                      editMemories: [],
                      deleteMemories: [],
                    }, pluginConfig)
                  ),
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
// src/plugins/my-oauth-plugin/index.ts
import { Google } from "arctic";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Container, OAuthClient, OAuthSetup, Plugin } from "../../types/index.ts";
import { type AppError, appError } from "../../errors.ts";
import { refreshPluginToken, registerOAuthRoutes } from "../../services/oauth.ts";
import { cron, managed, secret } from "../../services/config-schema.ts";
import type { PluginConfig } from "../../domains/plugins/index.ts";

const NAME = "my-oauth-plugin";

const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: secret(z.string().min(1)),
  "my-oauth-plugin-sync-schedule": cron(z.string().default("0 */6 * * *")),
  accessToken: managed(z.string().optional()),
  refreshToken: managed(z.string().optional()),
  tokenExpiresAt: managed(z.string().optional()),
});

type MyOAuthConfig = z.infer<typeof configSchema>;

const oauth: OAuthSetup = {
  createClient: (clientId: string, clientSecret: string, redirectUri: string) =>
    new Google(clientId, clientSecret, redirectUri),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  // Optional: customize authorization URL (e.g., for refresh tokens)
  createAuthorizationURL: (provider, state, codeVerifier, scopes) => {
    const url = provider.createAuthorizationURL(state, codeVerifier, scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url;
  },
};

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
  displayName: "My OAuth Plugin",
  configSchema,
  oauth,
  init: (apps, container) => {
    registerOAuthRoutes(apps, NAME, oauth, container);
  },
  cronJobs: (config) => [
    {
      name: `${NAME}-sync`,
      schedule: config?.["my-oauth-plugin-sync-schedule"] ?? "0 */6 * * *",
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

For receiving data via HTTP POST (iOS Shortcuts, webhooks, etc.). Uses API key auth. Ingest endpoints go on `apps.public` so they're accessible without dashboard auth.

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
  init: (apps, container) => {
    const { log, memory, plugins } = container;

    apps.public.post(`/api/plugins/${NAME}/ingest`, async (c) => {
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
  settingsUI: () => (
    <div class="custom-section">
      <h3>Setup</h3>
      <p>
        POST to <code>/api/plugins/{NAME}/ingest</code> with <code>x-api-key</code> header.
      </p>
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

1. **Always use neverthrow chains** - No throwing errors, use `errAsync`/`okAsync` and `.andThen()`. The returned ok/err Result will be logged.
2. **Use Luxon for dates** - `DateTime.now()`, `DateTime.fromISO()`, `.plus()`, `.minus()`
3. **Config via plugins domain** - `container.plugins.getConfig<T>(NAME)`
4. **Store via memory domain** - `container.memory.updateMemories({ memories, editMemories, deleteMemories }, pluginConfig)`
5. **Status codes in errors** - `appError("type", "message", statusCode)` for HTTP responses
6. **Cron as function** - `cronJobs: (config) => [...]` to use config values in schedule
7. **Cron field naming** - Schedule keys: `"${jobName}-schedule"`, enabled stored as `"${jobName}-enabled"`
8. **Cron field association** - Use `fields: ["myPrompt"]` on CronJob to render config fields inside the cron's admin fieldset
9. **Public vs admin apps** - `apps.public` for external endpoints (webhooks, ingest), `apps.admin` for dashboard routes
