import type { Hono } from "hono";
import { ResultAsync } from "neverthrow";
import type { MessagesDomain } from "../domains/messages/index.ts";
import type { MemoryDomain } from "../domains/memory/index.ts";
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

export interface Plugin {
  name: string;
  init?: (app: Hono<HonoEnv>, container: Container) => void;
  // Optional: Jobs to run on a schedule
  cronJobs?: CronJob[];
  // Optional: Logic to handle unstructured text (for your "Universal Inbox")
  onIngest?: (text: string) => Promise<string | null>;
}
