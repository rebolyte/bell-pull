import { z } from "@zod/zod";
import type { LogLevel } from "./logger.ts";

const logLevels: readonly LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
];

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default("0.0.0.0"),
  ENV: z.enum(["development", "production"]).default("development"),
  LOG_LEVEL: z.enum(logLevels).default("info"),
  DATABASE_PATH: z.string().default("bell-pull.db"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN required"),
  TELEGRAM_CHAT_ID: z.string().min(1, "TELEGRAM_CHAT_ID required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY required"),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(4196),
  TIMEZONE: z.string().default("America/Los_Angeles"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const createConfig = (overrides: Partial<AppConfig> = {}): AppConfig => {
  const raw = {
    PORT: Deno.env.get("PORT"),
    HOST: Deno.env.get("HOST"),
    ENV: Deno.env.get("ENV"),
    LOG_LEVEL: Deno.env.get("LOG_LEVEL"),
    DATABASE_PATH: Deno.env.get("DATABASE_PATH"),
    TELEGRAM_BOT_TOKEN: Deno.env.get("TELEGRAM_BOT_TOKEN"),
    TELEGRAM_CHAT_ID: Deno.env.get("TELEGRAM_CHAT_ID"),
    ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
    ANTHROPIC_MODEL: Deno.env.get("ANTHROPIC_MODEL"),
    ANTHROPIC_MAX_TOKENS: Deno.env.get("ANTHROPIC_MAX_TOKENS"),
    TIMEZONE: Deno.env.get("TIMEZONE"),
    ...overrides,
  };

  return ConfigSchema.parse(raw);
};
