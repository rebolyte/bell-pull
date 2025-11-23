import type { Hono } from "hono";
import type { MessagesDomain } from "../domains/messages/index.ts";
import type { MemoryDomain } from "../domains/memory/index.ts";

type AppConfig = {
  port: number;
  host: string;
  env: "development" | "production";
};
type Database = { save: (x: any) => void };
type Logger = { info: (msg: string) => void };
type Emailer = any;
type Stripe = any;

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

export type Reader<TDeps extends keyof Context, TArgs, TReturn> = (
  deps: Pick<Context, TDeps>,
) => (args: TArgs) => TReturn;

export interface Plugin {
  name: string;
  // Optional: Register routes (e.g. /auth/spotify/callback, /webhooks/health)
  registerRoutes?: (app: Hono) => void;
  // Optional: Jobs to run on a schedule
  cronJobs?: {
    schedule: string; // e.g., "0 9 * * *"
    run: () => Promise<void>;
  }[];
  // Optional: Logic to handle unstructured text (for your "Universal Inbox")
  onIngest?: (text: string) => Promise<string | null>;
}
