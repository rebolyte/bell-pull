import Parser from "rss-parser";
const parser = new Parser();

export const letterboxdPlugin: Plugin = {
  name: "letterboxd",
  cronJobs: [{
    schedule: "0 8 * * *", // Every morning at 8am
    run: async () => {
      const feed = await parser.parseURL("https://letterboxd.com/USER/rss/");
      const yesterdaysMovie = feed.items.find((item) => isYesterday(item.pubDate));
      if (yesterdaysMovie) {
        // Insert into SQLite "Memories" table
        await db.insert(memories).values({
          text: `Watched ${yesterdaysMovie.title}. Review: ${yesterdaysMovie.contentSnippet}`,
          category: "media",
        });
      }
    },
  }],
};
