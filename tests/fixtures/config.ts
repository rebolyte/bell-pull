import type { AppConfig } from "../../src/services/config.ts";

export const testConfig: AppConfig = {
  PORT: 0,
  HOST: "localhost",
  ENV: "development",
  LOG_LEVEL: "error",
  DATABASE_PATH: ":memory:",
  TELEGRAM_BOT_TOKEN: "test-bot-token",
  TELEGRAM_CHAT_ID: "123456",
  ANTHROPIC_API_KEY: "test-api-key",
  ANTHROPIC_MODEL: "claude-haiku-3-5-20241022",
  ANTHROPIC_MAX_TOKENS: 1024,
  TIMEZONE: "America/Los_Angeles",
};
