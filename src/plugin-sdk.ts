// Plugin SDK — stable import surface for community plugins.
// Community plugins import from here instead of reaching into internals.

// core plugin types
export type {
  Container,
  CronJob,
  CronJobRunContext,
  HonoEnv,
  OAuthClient,
  OAuthSetup,
  Plugin,
  ServerApps,
} from "./types/index.ts";

// config schema helpers
export { cron, hidden, managed, secret, textarea } from "./services/config-schema.ts";

// errors
export { AppError, appError, pluginError, toAppError } from "./errors.ts";
export type { ErrorType } from "./errors.ts";

// domain types used in plugin signatures
export type { PluginConfig } from "./domains/plugins/index.ts";
export type { MemoryMessageAnalysis } from "./domains/memory/index.ts";
