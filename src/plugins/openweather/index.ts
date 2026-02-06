import * as R from "@remeda/remeda";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { type AppError, appError, pluginError } from "../../errors.ts";
import {
  configSchema,
  type ForecastEntry,
  type ForecastResponse,
  type OpenWeatherConfig,
} from "./schema.ts";

const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC"
    .split(" "),
);

// OpenWeather q param requires country for US city+state; "City, ST" without country returns 404.
const normalizeLocation = (location: string): string => {
  const trimmed = location.trim();
  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length === 2 && US_STATE_CODES.has(parts[1].toUpperCase())) {
    return `${trimmed}, US`;
  }
  return trimmed;
};

const fetchForecast = (
  apiKey: string,
  location: string,
  units: string,
): ResultAsync<ForecastResponse, AppError> => {
  const params = new URLSearchParams({
    q: normalizeLocation(location),
    appid: apiKey,
    units,
  });
  const url = `https://api.openweathermap.org/data/2.5/forecast?${params}`;

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

const filterTodayEntries = (
  entries: ForecastEntry[],
  timezone: string,
): ForecastEntry[] => {
  const today = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");
  return R.filter(entries, (entry) =>
    DateTime.fromSeconds(entry.dt).setZone(timezone).toFormat("yyyy-MM-dd") === today);
};

const midDescription = (entries: ForecastEntry[]): string => {
  const mid = entries[Math.floor(entries.length / 2)];
  return mid.weather[0]?.description ?? "unknown";
};

const formatForecast = (
  data: ForecastResponse,
  units: string,
  timezone: string,
): string => {
  const tempUnit = units === "imperial" ? "F" : "C";
  const todayEntries = filterTodayEntries(data.list, timezone);

  if (R.isEmpty(todayEntries)) {
    return `No forecast data available for ${data.city.name} today`;
  }

  const temps = R.map(todayEntries, (e) => e.main.temp);
  const high = Math.round(Math.max(...temps));
  const low = Math.round(Math.min(...temps));

  const periods = R.groupBy(todayEntries, (entry) => {
    const hour = DateTime.fromSeconds(entry.dt).setZone(timezone).hour;
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    if (hour >= 18) return "evening";
    return "night";
  });

  const periodSummaries = R.pipe(
    ["morning", "afternoon", "evening"] as const,
    R.filter((p) => p in periods),
    R.map((p) => `${p}: ${midDescription(periods[p]!)}`),
    R.join(", "),
  );

  const maxPop = Math.round(Math.max(...R.map(todayEntries, (e) => e.pop)) * 100);

  return R.pipe(
    [
      `${data.city.name} forecast: High ${high}°${tempUnit}, Low ${low}°${tempUnit}`,
      periodSummaries || null,
      maxPop > 0 ? `${maxPop}% chance of precipitation` : null,
    ],
    R.filter(R.isNonNullish),
    R.join(". "),
  );
};

export const openweatherPlugin: Plugin<OpenWeatherConfig> = {
  name: "openweather",
  displayName: "OpenWeather",
  configSchema,
  cronJobs: (config) => [
    {
      name: "openweather-sync",
      schedule: config?.["openweather-sync-schedule"] ?? "0 6 * * *",
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

          return fetchForecast(apiKey, location, units)
            .map((data) => formatForecast(data, units, config.TIMEZONE))
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
