import type { Hono } from "hono";
import type * as z from "@zod/zod";
import { ResultAsync } from "neverthrow";
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

export type CronJob = {
  name: string;
  schedule: string; // e.g., "0 9 * * *"
  run: (container: Container) => ResultAsync<unknown, AppError>;
};

// Arctic OAuth provider interface (subset we use)
export type OAuthProvider = {
  createAuthorizationURL: (
    state: string,
    codeVerifier: string,
    scopes: string[],
  ) => URL;
  validateAuthorizationCode: (
    code: string,
    codeVerifier: string,
  ) => Promise<OAuthTokens>;
  refreshAccessToken: (refreshToken: string) => Promise<OAuthTokens>;
};

export type OAuthTokens = {
  accessToken: () => string;
  refreshToken: () => string | null;
  accessTokenExpiresAt: () => Date | null;
};

export type OAuthSetup = {
  createProvider: (
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) => OAuthProvider;
  scopes: string[];
};

export interface Plugin<TConfig = unknown> {
  name: string;
  displayName?: string;
  configSchema?: z.ZodSchema<TConfig>;
  oauth?: OAuthSetup;
  init?: (app: Hono<HonoEnv>, container: Container) => void;
  cronJobs?: CronJob[] | ((config: TConfig) => CronJob[]);
  onIngest?: (text: string) => Promise<string | null>;
}
