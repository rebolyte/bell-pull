export interface AppConfig {
  PORT: number;
  HOST: string;
  ENV: "development" | "production";
  DATABASE_PATH: string;
  TELEGRAM_BOT_TOKEN: string;
}

export const createConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  PORT: Number(Deno.env.get("PORT")) || 8000,
  HOST: Deno.env.get("HOST") || "0.0.0.0",
  ENV: (Deno.env.get("ENV") || "development") as "development" | "production",
  DATABASE_PATH: Deno.env.get("DATABASE_PATH") || "bell-pull.db",
  TELEGRAM_BOT_TOKEN: Deno.env.get("TELEGRAM_BOT_TOKEN") || "",
  ...overrides,
});
