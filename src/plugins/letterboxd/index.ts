import Parser from "rss-parser";
import type { Plugin } from "../../types/index.ts";

const parser = new Parser();

const isYesterday = (dateStr?: string) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
};

export const letterboxdPlugin: Plugin = {
  name: "letterboxd",
  cronJobs: [{
    schedule: "0 8 * * *", // Every morning at 8am
    run: async () => {
      // TODO: Implement proper config/env for user URL
      // const feed = await parser.parseURL("https://letterboxd.com/USER/rss/");
      // const yesterdaysMovie = feed.items.find((item) => isYesterday(item.pubDate));
      // if (yesterdaysMovie) {
      //   // Insert into SQLite "Memories" table
      //   // await db.insertInto('memories').values({
      //   //   text: `Watched ${yesterdaysMovie.title}. Review: ${yesterdaysMovie.contentSnippet}`,
      //   //   category: "media",
      //   // }).execute();
      // }
    },
  }],
};
