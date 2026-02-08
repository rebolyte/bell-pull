import type { Plugin } from "../types/index.ts";
import { appleHealthPlugin } from "./apple-health/index.tsx";
import { googleCalendarPlugin } from "./google-calendar/index.ts";
import { letterboxdPlugin } from "./letterboxd/index.ts";
import { openweatherPlugin } from "./openweather/index.ts";
import { telegramPlugin } from "./telegram/index.ts";
import { ticktickPlugin } from "./ticktick/index.ts";

export const plugins: Plugin<any>[] = [
  telegramPlugin,
  letterboxdPlugin,
  googleCalendarPlugin,
  openweatherPlugin,
  appleHealthPlugin,
  ticktickPlugin,
];
