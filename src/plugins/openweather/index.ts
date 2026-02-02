import * as R from "@remeda/remeda";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { type AppError, appError, pluginError } from "../../errors.ts";
import { configSchema, OpenWeatherConfig } from "./schema.ts";

type WeatherResponse = {
  main: { temp: number; humidity: number };
  weather: { description: string }[];
  name: string;
};

const fetchWeather = (
  apiKey: string,
  location: string,
  units: string,
): ResultAsync<WeatherResponse, AppError> => {
  const params = new URLSearchParams({
    q: location,
    appid: apiKey,
    units,
  });
  const url = `https://api.openweathermap.org/data/2.5/weather?${params}`;

  return ResultAsync.fromPromise(
    fetch(url).then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenWeather API error: ${response.status} ${text}`);
      }
      return response.json();
    }),
    pluginError("OpenWeather API error"),
  );
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
      run: (container, job) => {
        const { memory, plugins, config } = container;

        const configRes = plugins
          .getConfig<OpenWeatherConfig>(openweatherPlugin.name)
          .andThen((pluginConfig) => {
            if (pluginConfig === null || R.isEmptyish(pluginConfig.config.apiKey)) {
              return errAsync(appError("plugin", `[${job.name}] Plugin not configured`));
            }
            return okAsync(pluginConfig);
          });

        return configRes.andThen((pluginConfig) => {
          const { apiKey, location, units } = pluginConfig.config;

          return fetchWeather(apiKey, location, units)
            .map((data) => formatWeather(data, units))
            .andThen((text) => {
              const today = DateTime.now().setZone(config.TIMEZONE).toFormat("yyyy-MM-dd");
              return memory
                .updateMemories(
                  {
                    memories: [{ date: today, text }],
                    editMemories: [],
                    deleteMemories: [],
                    response: "",
                  },
                  pluginConfig,
                )
                .map(() => ({ weather: text }));
            });
        });
      },
    },
  ],
};
