import type { Hono } from "hono";
import type * as z from "@zod/zod";
import { ResultAsync } from "neverthrow";
import { OAuth2Tokens } from "arctic";
import type { MessagesDomain } from "../domains/messages/index.ts";
import type { MemoryDomain } from "../domains/memory/index.ts";
import type { PluginsDomain } from "../domains/plugins/index.ts";
import type { Database } from "../services/database.ts";
import type { AppConfig } from "../services/config.ts";
import type { LLMService } from "../services/llm.ts";
import type { Logger } from "../services/logger.ts";
import type { AppError } from "../errors.ts";

// the "container"
export type Services = {
  config: AppConfig;
  db: Database;
  log: Logger;
  llm: LLMService;
};

export type Domains = {
  messages: MessagesDomain;
  memory: MemoryDomain;
  plugins: PluginsDomain;
};

export type Container = Services & Domains;

export type HonoEnv = {
  Variables: {
    container: Container;
  };
};

export type CronJobRunContext = { name: string; schedule: string };

export type CronJob = {
  name: string;
  schedule: string; // e.g., "0 9 * * *"
  run: (
    container: Container,
    job: CronJobRunContext,
  ) => ResultAsync<Record<string, unknown> | null, AppError>;
};

// Arctic OAuth client interface (subset we use, they don't have generic interface)
export type OAuthClient = {
  createAuthorizationURL: (
    state: string,
    codeVerifier: string,
    scopes: string[],
  ) => URL;
  validateAuthorizationCode: (
    code: string,
    codeVerifier: string,
  ) => Promise<OAuth2Tokens>;
  refreshAccessToken: (refreshToken: string) => Promise<OAuth2Tokens>;
};

export type OAuthSetup = {
  createClient: (
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) => OAuthClient;
  scopes: string[];
  createAuthorizationURL?: (
    provider: OAuthClient,
    state: string,
    codeVerifier: string,
    scopes: string[],
  ) => URL;
};

export type ServerApps = {
  public: Hono<HonoEnv>;
  admin: Hono<HonoEnv>;
};

export interface Plugin<TConfig = unknown> {
  name: string;
  displayName?: string;
  configSchema?: z.ZodSchema<TConfig>;
  oauth?: OAuthSetup;
  init?: (apps: ServerApps, container: Container) => void;
  cronJobs?: CronJob[] | ((config: TConfig) => CronJob[]);
  onIngest?: (text: string) => Promise<string | null>;
  settingsUI?: (config: TConfig, container: Container) => unknown;
}
