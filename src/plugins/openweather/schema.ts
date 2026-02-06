import * as z from "@zod/zod";
import { cron, secret } from "../../services/config-schema.ts";

export const configSchema = z.object({
  apiKey: secret(z.string().min(1)),
  location: z.string().default("San Francisco, CA"),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  "openweather-sync-schedule": cron(z.string().default("0 6 * * *")),
});

export type OpenWeatherConfig = z.infer<typeof configSchema>;

export type ForecastEntry = {
  dt: number;
  main: { temp: number; humidity: number };
  weather: { description: string }[];
  pop: number;
};

export type ForecastResponse = {
  list: ForecastEntry[];
  city: { name: string };
};
