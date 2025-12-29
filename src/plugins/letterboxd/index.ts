import Parser from "rss-parser";
import type { Plugin } from "../../types/index.ts";
import { okAsync } from "neverthrow";

const parser = new Parser();

export const letterboxdPlugin: Plugin = {
  name: "letterboxd",
  cronJobs: [{
    name: "letterboxd-ingest-movies",
    schedule: "0 8 * * *", // Every morning at 8am
    run: (container) => {
      return okAsync(null);
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
