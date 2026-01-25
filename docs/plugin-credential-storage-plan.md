# Plugin Credential Storage Plan

Store plugin configs/credentials in DB with auto-generated admin UI.

## Database

```sql
CREATE TABLE plugin_configs (
  plugin_name TEXT PRIMARY KEY,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Single JSON blob per plugin. Schema validation via Zod on read/write.

## Plugin Interface Changes

```typescript
type OAuthSetup = {
  createProvider: (clientId: string, clientSecret: string, redirectUri: string) => ArcticProvider;
  scopes: string[];
};

export interface Plugin<TConfig = unknown> {
  name: string;
  displayName?: string;
  configSchema?: z.ZodSchema<TConfig>;
  oauth?: OAuthSetup;  // plugin owns its provider
  init?: (app: Hono<HonoEnv>, container: Container) => void;
  cronJobs?: CronJob[] | ((config: TConfig) => CronJob[]);  // static or config-driven
  onIngest?: (text: string) => Promise<string | null>;
}
```

## Schema Field Markers

Zod `.describe()` drives UI rendering:

```typescript
// Helpers
const secret = <T extends z.ZodTypeAny>(schema: T) => schema.describe('field:secret');
const cron = <T extends z.ZodTypeAny>(schema: T) => schema.describe('field:cron');

// Usage
z.object({
  apiKey: secret(z.string()),              // password input + reveal toggle
  username: z.string(),                     // text input
  syncHours: z.number().default(24),        // number input
  units: z.enum(['imperial', 'metric']),    // dropdown
  enabled: z.boolean(),                     // toggle
  schedule: cron(z.string().default('0 9 * * *')),  // cron input + presets
})
```

OAuth-managed fields (accessToken, refreshToken, tokenExpiresAt) hidden from form, populated by callback.

## Config-Driven Cron Schedules

Schedules stored in config, editable via admin UI:

```typescript
// Helper for cron field
const cron = <T extends z.ZodTypeAny>(schema: T) => schema.describe('field:cron');

// google-calendar/index.ts
const configSchema = z.object({
  clientId: z.string(),
  clientSecret: secret(z.string()),
  calendarId: z.string().default('primary'),
  syncSchedule: cron(z.string().default('0 */6 * * *')),  // every 6 hours
});

export const googleCalendarPlugin: Plugin<z.infer<typeof configSchema>> = {
  name: 'google-calendar',
  configSchema,
  oauth: { /* ... */ },
  cronJobs: (config) => [{
    name: 'google-calendar-sync',
    schedule: config.syncSchedule,
    run: (container) => syncCalendar(container, config),
  }],
};
```

```typescript
// telegram/index.ts - multiple schedules
const configSchema = z.object({
  botToken: secret(z.string()),
  chatId: z.string(),
  briefingSchedule: cron(z.string().default('0 9 * * *')),   // 9am daily
  reminderSchedule: cron(z.string().default('0 18 * * *')),  // 6pm daily
});

export const telegramPlugin: Plugin<z.infer<typeof configSchema>> = {
  name: 'telegram',
  configSchema,
  cronJobs: (config) => [
    {
      name: 'daily-briefing',
      schedule: config.briefingSchedule,
      run: (container) => sendBriefing(container, config),
    },
    {
      name: 'evening-reminder',
      schedule: config.reminderSchedule,
      run: (container) => sendReminder(container, config),
    },
  ],
};
```

UI renders `field:cron` as text input with helper (common presets dropdown or validation hint).

## Cron Re-registration

When config changes, crons must be re-registered:

```typescript
// server.ts or cron-runner.ts
const registerPluginCrons = (plugin: Plugin, config: unknown, container: Container) => {
  const jobs = typeof plugin.cronJobs === 'function'
    ? plugin.cronJobs(config)
    : plugin.cronJobs ?? [];

  jobs.forEach((job) => scheduleCron(job, container));  // replaces existing by name
};

// On config update (RPC handler)
setPluginConfig: async (name, newConfig) => {
  await pluginDomain.setConfig(name, newConfig);
  const plugin = plugins.find(p => p.name === name);
  registerPluginCrons(plugin, newConfig, container);  // re-register with new schedules
}
```

Existing `scheduleCron` already supports replacing tasks by name.

## OAuth Flow

Plugin declares oauth setup, generic helper wires routes:

```typescript
// Plugin (google-calendar/index.ts)
import { Google } from 'arctic';

export const googleCalendarPlugin: Plugin = {
  name: 'google-calendar',
  configSchema: z.object({
    clientId: z.string(),
    clientSecret: secret(z.string()),
    calendarId: z.string().default('primary'),
  }),
  oauth: {
    createProvider: (id, secret, uri) => new Google(id, secret, uri),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  },
};
```

```typescript
// Server wiring (server.ts)
plugins.forEach((plugin) => {
  plugin.init?.(app, container);
  registerOAuthRoutes(app, plugin, container);  // auto if oauth defined
  // ...crons
});
```

Generated routes:
- `GET /oauth/{plugin-name}/authorize` - redirect to provider
- `GET /oauth/{plugin-name}/callback` - exchange code, store tokens

State + PKCE verifier stored in httpOnly cookies for callback verification.

## Admin UI

RPC endpoints:

```typescript
getPlugins(): PluginInfo[]           // name, displayName, hasOAuth, enabled, configSchema as JSON Schema
getPluginConfig(name): object        // current config (secrets masked)
setPluginConfig(name, config): void  // validate via Zod, store
```

UI auto-generates form from JSON Schema:
- `field:secret` → password input with eye toggle, shows "••••••••" if set
- `oauth` defined → "Connect" button instead of token fields
- Connected state shown based on presence of accessToken

## Domain Layer

```typescript
// src/domains/plugins.ts
export const createPluginDomain = (db: Kysely<Database>) => ({
  getConfig: (name: string): ResultAsync<PluginConfig, AppError>,
  setConfig: (name: string, config: unknown): ResultAsync<void, AppError>,
  listPlugins: (): ResultAsync<PluginConfig[], AppError>,
  setEnabled: (name: string, enabled: boolean): ResultAsync<void, AppError>,
});
```

## Implementation Order

1. Migration: add plugin_configs table
2. Domain: plugins.ts with getConfig/setConfig/listPlugins
3. Schema helpers: secret(), field type detection from describe()
4. OAuth service: registerOAuthRoutes(), cookie handling, token storage
5. RPC endpoints: getPlugins, getPluginConfig, setPluginConfig
6. Admin UI: plugin list, config form generation, OAuth connect flow
7. Update Plugin type, migrate telegram plugin to use DB config
8. Example: google-calendar plugin with OAuth

## File Structure

```
src/
  domains/
    plugins.ts              # DB operations
  services/
    oauth.ts                # registerOAuthRoutes, cookie helpers
    config-schema.ts        # secret() helper, schema-to-jsonschema
  plugins/
    google-calendar/
      index.ts              # plugin definition with oauth
    spotify/
      index.ts
  routes/
    oauth.ts                # if extracted from service
migrations/
  0002_plugin_configs.ts
```

## Dependencies

- `arctic` - OAuth providers
- `zod-to-json-schema` - schema → UI form generation
