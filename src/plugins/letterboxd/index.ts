import * as z from "@zod/zod";
import { DateTime } from "luxon";
import Parser from "rss-parser";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { appError, pluginError } from "../../errors.ts";
import { cron } from "../../services/config-schema.ts";

const NAME = "letterboxd";

const configSchema = z.object({
  username: z.string().min(1),
  "letterboxd-sync-schedule": cron(z.string().default("0 8 * * *")),
});

type LetterboxdConfig = z.infer<typeof configSchema>;

type DiaryEntry = {
  title: string;
  link: string;
  pubDate: string;
  watchedDate: string | null;
  contentSnippet?: string;
};

const parser = new Parser({
  customFields: {
    item: [["letterboxd:watchedDate", "watchedDate"]],
  },
});

const fetchRecentDiary = (
  username: string,
): ResultAsync<DiaryEntry[], ReturnType<typeof appError>> => {
  const feedUrl = `https://letterboxd.com/${username}/rss/`;

  // fetch ourselves instead of parser.parseURL() so MSW can stub fetch

  return ResultAsync.fromPromise(
    fetch(feedUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((xml) => parser.parseString(xml)),
    pluginError("Failed to fetch Letterboxd RSS"),
  ).map((feed) =>
    (feed.items ?? [])
      .filter((item) => item.link?.includes("/film/"))
      .map((item) => {
        const itemAny = item as unknown as Record<string, string>;
        return {
          title: item.title ?? "Unknown",
          link: item.link ?? "",
          pubDate: item.pubDate ?? "",
          watchedDate: itemAny.watchedDate ?? itemAny["letterboxd:watchedDate"] ?? null,
          contentSnippet: item.contentSnippet,
        };
      })
  );
};

export const letterboxdPlugin: Plugin<LetterboxdConfig> = {
  name: NAME,
  displayName: "Letterboxd",
  configSchema,
  cronJobs: (config) => [
    {
      name: "letterboxd-sync",
      schedule: config?.["letterboxd-sync-schedule"] ?? "0 8 * * *",
      run: (container, job) => {
        const { log, memory, plugins } = container;

        return plugins
          .getConfig<LetterboxdConfig>(NAME)
          .andThen((pluginConfig) => {
            if (!pluginConfig) {
              return errAsync(appError("plugin", `[${job.name}] Plugin not configured`));
            }
            return okAsync(pluginConfig);
          })
          .andThen((pluginConfig) => {
            const { username } = pluginConfig.config;

            return fetchRecentDiary(username)
              .andTee((entries) => {
                log.info`[${job.name}] Fetched ${entries.length} diary entries`;
              })
              .andThen((entries) => {
                const yesterday = DateTime.now().minus({ days: 1 }).startOf("day");
                const recentEntries = entries.filter((entry) => {
                  const entryDate = DateTime.fromRFC2822(entry.pubDate);
                  return entryDate >= yesterday;
                });

                if (recentEntries.length === 0) {
                  log.info`[${job.name}] No recent diary entries`;
                  return okAsync({ synced: 0 });
                }

                return ResultAsync.combine(
                  recentEntries.map((entry) => {
                    const memoryDate = entry.watchedDate ??
                      DateTime.fromRFC2822(entry.pubDate).toISODate()!;
                    const text = entry.contentSnippet
                      ? `Watched: ${entry.title}. ${entry.contentSnippet}`
                      : `Watched: ${entry.title}`;

                    return memory.updateMemories(
                      {
                        memories: [{
                          date: memoryDate,
                          text,
                          externalId: entry.link || null,
                          original: JSON.stringify(entry),
                        }],
                        editMemories: [],
                        deleteMemories: [],
                        response: "",
                      },
                      pluginConfig,
                    );
                  }),
                ).map(() => ({ synced: recentEntries.length }));
              });
          });
      },
    },
  ],
};
