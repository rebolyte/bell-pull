import * as z from "@zod/zod";
import { cron, secret } from "../../services/config-schema.ts";

export const configSchema = z.object({
  apiKey: secret(z.string().min(1)),
  location: z.string().default("San Francisco, CA"),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  syncSchedule: cron(z.string().default("0 6 * * *")), // 6am daily
});

export type OpenWeatherConfig = z.infer<typeof configSchema>;

export type WeatherResponse = {
  main: { temp: number; humidity: number };
  weather: { description: string }[];
  name: string;
};
