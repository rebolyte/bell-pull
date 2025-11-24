import type { Hono } from "hono";
import type { MessagesDomain } from "../domains/messages/index.ts";
import type { MemoryDomain } from "../domains/memory/index.ts";
import type { Database } from "../services/database.ts";

type AppConfig = {
  port: number;
  host: string;
  env: "development" | "production";
};

type Logger = { info: (msg: string) => void };
type Emailer = unknown;
type Stripe = unknown;

// the "container"
export type Services = {
  config: AppConfig;
  db: Database;
  logger: Logger;
  emailService: Emailer;
  paymentGateway: Stripe;
};

export type Domains = {
  messages: MessagesDomain;
  memory: MemoryDomain;
};

export type Context = Services & Domains;

export type HonoEnv = {
  Variables: {
    container: Context;
  };
};

export type Reader<TDeps extends keyof Context, TArgs, TReturn> = (
  deps: Pick<Context, TDeps>,
) => (args: TArgs) => TReturn;

export interface Plugin {
  name: string;
  // Optional: Register routes (e.g. /auth/spotify/callback, /webhooks/health)
  registerRoutes?: (app: Hono<HonoEnv>) => void;
  // Optional: Jobs to run on a schedule
  cronJobs?: {
    schedule: string; // e.g., "0 9 * * *"
    run: () => Promise<void>;
  }[];
  // Optional: Logic to handle unstructured text (for your "Universal Inbox")
  onIngest?: (text: string) => Promise<string | null>;
}
