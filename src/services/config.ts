export interface AppConfig {
  PORT: number;
  HOST: string;
  ENV: "development" | "production";
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  DATABASE_PATH: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_MAX_TOKENS: number;
  TIMEZONE: string;
}

export const createConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  PORT: Number(Deno.env.get("PORT")) || 8000,
  HOST: Deno.env.get("HOST") || "0.0.0.0",
  ENV: (Deno.env.get("ENV") || "development") as "development" | "production",
  LOG_LEVEL: (Deno.env.get("LOG_LEVEL") || "info") as "debug" | "info" | "warn" | "error",
  DATABASE_PATH: Deno.env.get("DATABASE_PATH") || "bell-pull.db",
  TELEGRAM_BOT_TOKEN: Deno.env.get("TELEGRAM_BOT_TOKEN") || "",
  TELEGRAM_CHAT_ID: Deno.env.get("TELEGRAM_CHAT_ID") || "",
  ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY") || "",
  ANTHROPIC_MODEL: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
  ANTHROPIC_MAX_TOKENS: Number(Deno.env.get("ANTHROPIC_MAX_TOKENS")) || 4196,
  TIMEZONE: Deno.env.get("TIMEZONE") || "America/Los_Angeles",
  ...overrides,
});
