import * as z from "@zod/zod";
import { ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { cron, secret } from "../../services/config-schema.ts";
import { pluginError } from "../../errors.ts";

const configSchema = z.object({
  apiKey: secret(z.string().min(1)),
  location: z.string().default("San Francisco, CA"),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  syncSchedule: cron(z.string().default("0 6 * * *")), // 6am daily
});

type OpenWeatherConfig = z.infer<typeof configSchema>;

type WeatherResponse = {
  main: { temp: number; humidity: number };
  weather: { description: string }[];
  name: string;
};

const fetchWeather = async (
  apiKey: string,
  location: string,
  units: string,
): Promise<WeatherResponse> => {
  const params = new URLSearchParams({
    q: location,
    appid: apiKey,
    units,
  });

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${params}`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenWeather API error: ${response.status} ${text}`);
  }

  return response.json();
};

const formatWeather = (data: WeatherResponse, units: string): string => {
  const tempUnit = units === "imperial" ? "F" : "C";
  const description = data.weather[0]?.description ?? "unknown";
  return `Weather in ${data.name}: ${
    Math.round(data.main.temp)
  }°${tempUnit}, ${description}, ${data.main.humidity}% humidity`;
};

export const openweatherPlugin: Plugin<OpenWeatherConfig> = {
  name: "openweather",
  displayName: "OpenWeather",
  configSchema,
  cronJobs: (config) => [
    {
      name: "openweather-sync",
      schedule: config?.syncSchedule ?? "0 6 * * *",
      run: (container, _job) =>
        ResultAsync.fromPromise(
          (async () => {
            const configResult = await container.plugins.getConfig(openweatherPlugin.name);
            const pluginConfig = configResult.isOk() ? configResult.value ?? undefined : undefined;

            const weather = await fetchWeather(config.apiKey, config.location, config.units);
            const text = formatWeather(weather, config.units);

            container.log.info`Fetched weather: ${text}`;

            const today = new Date().toISOString().split("T")[0];
            await container.memory.updateMemories({
              memories: [{ date: today, text }],
              editMemories: [],
              deleteMemories: [],
              response: "",
            }, pluginConfig);

            return { weather: text };
          })(),
          pluginError("[openweather-sync] Sync failed"),
        ),
    },
  ],
};
