import type { Plugin } from "../types/index.ts";
import { letterboxdPlugin } from "./letterboxd/index.ts";
import { telegramPlugin } from "./telegram/index.ts";

export const plugins: Plugin[] = [telegramPlugin, letterboxdPlugin];
