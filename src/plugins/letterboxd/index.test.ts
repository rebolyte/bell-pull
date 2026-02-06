import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { DateTime } from "luxon";
import { mswMock, withHandlers } from "../../../tests/fixtures/mocks/server.ts";
import {
  letterboxdEmpty,
  letterboxdError,
  letterboxdSuccess,
  letterboxdWithItems,
} from "./mock.ts";
import { createTestHarness } from "../../../tests/fixtures/container.ts";
import { letterboxdPlugin } from "./index.ts";

describe("Letterboxd Cron Job", () => {
  beforeAll(() => {
    mswMock.listen([letterboxdSuccess()]);
  });
  afterAll(() => mswMock.close());
  afterEach(() => mswMock.resetHandlers());

  const setupPlugin = async (h: Awaited<ReturnType<typeof createTestHarness>>) => {
    const result = await h.container.plugins.setConfig("letterboxd", {
      username: "testuser",
    });
    if (result.isErr()) throw result.error;
  };

  const runCronJob = (h: Awaited<ReturnType<typeof createTestHarness>>) => {
    const cronJobs = typeof letterboxdPlugin.cronJobs === "function"
      ? letterboxdPlugin.cronJobs({ username: "testuser" } as any)
      : letterboxdPlugin.cronJobs!;
    const cronJob = cronJobs[0];
    return cronJob.run(h.container, { name: "test", schedule: "" });
  };

  it("fetches diary entries and stores memories", async () => {
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      const result = await runCronJob(h);

      expect(result.isOk()).toBe(true);

      const memories = await h.container.db
        .selectFrom("memories")
        .selectAll()
        .execute();

      expect(memories).toHaveLength(1);
      expect(memories[0].text).toContain("Watched: The Brutalist");
    } finally {
      await h.cleanup();
    }
  });

  it("uses watchedDate as memory date", async () => {
    const watchedDate = DateTime.now().minus({ days: 3 }).toISODate()!;
    withHandlers(letterboxdWithItems({
      title: "Nosferatu, 2024",
      link: "https://letterboxd.com/user/film/nosferatu-2024/",
      watchedDate,
    }));
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      await runCronJob(h);

      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories).toHaveLength(1);
      expect(memories[0].date).toBe(watchedDate);
    } finally {
      await h.cleanup();
    }
  });

  it("falls back to pubDate when watchedDate absent", async () => {
    const pubDate = DateTime.now().toRFC2822();
    withHandlers(letterboxdWithItems({
      title: "Anora, 2024",
      link: "https://letterboxd.com/user/film/anora/",
      pubDate,
    }));
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      await runCronJob(h);

      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories).toHaveLength(1);
      expect(memories[0].date).toBe(DateTime.now().toISODate());
    } finally {
      await h.cleanup();
    }
  });

  it("includes content snippet in memory text", async () => {
    withHandlers(letterboxdWithItems({
      title: "Dune, 2021",
      link: "https://letterboxd.com/user/film/dune-2021/",
      contentSnippet: "Incredible visuals",
    }));
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      await runCronJob(h);

      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories[0].text).toBe("Watched: Dune, 2021. Incredible visuals");
    } finally {
      await h.cleanup();
    }
  });

  it("handles empty feed", async () => {
    withHandlers(letterboxdEmpty());
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      const result = await runCronJob(h);

      expect(result.isOk()).toBe(true);
      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories).toHaveLength(0);
    } finally {
      await h.cleanup();
    }
  });

  it("filters out old entries", async () => {
    const oldDate = DateTime.now().minus({ days: 5 }).toRFC2822();
    withHandlers(letterboxdWithItems({
      title: "Old Film, 2020",
      link: "https://letterboxd.com/user/film/old-film/",
      pubDate: oldDate,
    }));
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      const result = await runCronJob(h);

      expect(result.isOk()).toBe(true);
      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories).toHaveLength(0);
    } finally {
      await h.cleanup();
    }
  });

  it("handles fetch errors", async () => {
    withHandlers(letterboxdError(500));
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      const result = await runCronJob(h);
      expect(result.isErr()).toBe(true);
    } finally {
      await h.cleanup();
    }
  });

  it("returns error when not configured", async () => {
    const h = await createTestHarness();
    try {
      const result = await runCronJob(h);
      expect(result.isErr()).toBe(true);
    } finally {
      await h.cleanup();
    }
  });

  it("does not create duplicate memories when synced twice", async () => {
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      await runCronJob(h);
      const afterFirst = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(afterFirst).toHaveLength(1);

      await runCronJob(h);
      const afterSecond = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(afterSecond).toHaveLength(1);
    } finally {
      await h.cleanup();
    }
  });
});
