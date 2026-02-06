import { DateTime } from "luxon";
import { delay, http, HttpResponse } from "msw";
import type { ForecastEntry, ForecastResponse } from "./schema.ts";

const BASE_URL = "https://api.openweathermap.org/data/2.5/forecast";

const TZ = "America/Los_Angeles";

const todayAt = (hour: number): number =>
  DateTime.now().setZone(TZ).startOf("day").set({ hour }).toSeconds();

const makeEntry = (
  hour: number,
  overrides: Partial<Pick<ForecastEntry, "main" | "weather" | "pop">> = {},
): ForecastEntry => ({
  dt: todayAt(hour),
  main: overrides.main ?? { temp: 72, humidity: 50 },
  weather: overrides.weather ?? [{ description: "sunny" }],
  pop: overrides.pop ?? 0,
});

const defaultForecast: ForecastResponse = {
  list: [
    makeEntry(6),
    makeEntry(9),
    makeEntry(12, { main: { temp: 75, humidity: 45 } }),
    makeEntry(15, { main: { temp: 74, humidity: 48 } }),
    makeEntry(18, { main: { temp: 68, humidity: 55 }, weather: [{ description: "partly cloudy" }] }),
    makeEntry(21, { main: { temp: 65, humidity: 60 }, weather: [{ description: "partly cloudy" }] }),
  ],
  city: { name: "San Francisco" },
};

export const forecastSuccess = (overrides: Partial<ForecastResponse> = {}) =>
  http.get(BASE_URL, () =>
    HttpResponse.json({
      ...defaultForecast,
      ...overrides,
      list: overrides.list ?? defaultForecast.list,
      city: overrides.city ?? defaultForecast.city,
    }));

export const forecastError = (status: number, message = "API Error") =>
  http.get(BASE_URL, () => HttpResponse.json({ message }, { status }));

export const forecastTimeout = (ms = 5000) =>
  http.get(BASE_URL, async () => {
    await delay(ms);
    return HttpResponse.json(defaultForecast);
  });

export const forecastCold = () =>
  forecastSuccess({
    list: [
      makeEntry(6, { main: { temp: 28, humidity: 80 }, weather: [{ description: "snow" }] }),
      makeEntry(9, { main: { temp: 30, humidity: 78 }, weather: [{ description: "snow" }] }),
      makeEntry(12, { main: { temp: 32, humidity: 75 }, weather: [{ description: "light snow" }] }),
      makeEntry(15, { main: { temp: 31, humidity: 77 }, weather: [{ description: "snow" }] }),
      makeEntry(18, { main: { temp: 27, humidity: 82 }, weather: [{ description: "snow" }], pop: 0.9 }),
    ],
  });
