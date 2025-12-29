import type { Hono } from "hono";
import type { MessagesDomain } from "../domains/messages/index.ts";
import type { MemoryDomain } from "../domains/memory/index.ts";
import type { Database } from "../services/database.ts";
import type { AppConfig } from "../services/config.ts";
import type { LLMService } from "../services/llm.ts";
import type { Logger } from "../services/logger.ts";

// the "container"
export type Services = {
  config: AppConfig;
  db: Database;
  logger: Logger;
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

export interface Plugin {
  name: string;
  init?: (app: Hono<HonoEnv>, container: Container) => void;
  // Optional: Jobs to run on a schedule
  cronJobs?: {
    schedule: string; // e.g., "0 9 * * *"
    run: () => Promise<void>;
  }[];
  // Optional: Logic to handle unstructured text (for your "Universal Inbox")
  onIngest?: (text: string) => Promise<string | null>;
}
