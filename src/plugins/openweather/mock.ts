import { delay, http, HttpResponse } from "msw";
import type { WeatherResponse } from "./schema.ts";

const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

const defaultWeather: WeatherResponse = {
  main: { temp: 72, humidity: 50 },
  weather: [{ description: "sunny" }],
  name: "San Francisco",
};

export const weatherSuccess = (data: Partial<WeatherResponse> = {}) =>
  http.get(BASE_URL, () => HttpResponse.json({ ...defaultWeather, ...data }));

export const weatherError = (status: number, message = "API Error") =>
  http.get(BASE_URL, () => HttpResponse.json({ message }, { status }));

export const weatherTimeout = (ms = 5000) =>
  http.get(BASE_URL, async () => {
    await delay(ms);
    return HttpResponse.json(defaultWeather);
  });

export const weatherFromLocation = () =>
  http.get(BASE_URL, ({ request }) => {
    const url = new URL(request.url);
    const location = url.searchParams.get("q") ?? "Unknown";
    return HttpResponse.json({ ...defaultWeather, name: location });
  });

export const weatherCold = () =>
  weatherSuccess({ main: { temp: 32, humidity: 80 }, weather: [{ description: "snow" }] });

export const weatherHot = () =>
  weatherSuccess({ main: { temp: 100, humidity: 20 }, weather: [{ description: "clear sky" }] });
