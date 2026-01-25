import {
  configure,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  type Logger as LogtapeLogger,
  type LogLevel,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { AppConfig } from "./config.ts";

export type Logger = LogtapeLogger;
export type { LogLevel };

export const makeLogger = async (config: AppConfig): Promise<Logger> => {
  const { APP_ENV, LOG_LEVEL } = config;

  const pretty = getPrettyFormatter({
    properties: true,
    icons: false,
  });

  const jsonl = getJsonLinesFormatter();

  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: APP_ENV === "dev" ? pretty : jsonl,
      }),
    },
    loggers: [
      { category: ["app", "server"], sinks: ["console"], lowestLevel: LOG_LEVEL },
      { category: ["app", "hono"], sinks: ["console"], lowestLevel: LOG_LEVEL },
    ],
  });

  return getLogger(["app", "server"]);
};
