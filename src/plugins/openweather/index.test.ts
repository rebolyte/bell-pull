import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { mswMock, withHandlers } from "../../../tests/fixtures/mocks/server.ts";
import { weatherCold, weatherError, weatherSuccess } from "./mock.ts";
import { createTestHarness } from "../../../tests/fixtures/container.ts";
import { openweatherPlugin } from "./index.ts";

describe("OpenWeather Cron Job", () => {
  beforeAll(() => {
    const defaultHandlers = [
      weatherSuccess(),
    ];
    mswMock.listen(defaultHandlers);
  });
  afterAll(() => mswMock.close());
  afterEach(() => mswMock.resetHandlers());

  const setupPlugin = async (h: Awaited<ReturnType<typeof createTestHarness>>) => {
    const result = await h.container.plugins.setConfig("openweather", {
      apiKey: "test-key",
      location: "San Francisco",
      units: "imperial",
    });
    if (result.isErr()) throw result.error;
  };

  const runCronJob = (h: Awaited<ReturnType<typeof createTestHarness>>) => {
    const cronJobs = typeof openweatherPlugin.cronJobs === "function"
      ? openweatherPlugin.cronJobs({} as any)
      : openweatherPlugin.cronJobs!;
    const cronJob = cronJobs[0];
    return cronJob.run(h.container, { name: "test", schedule: "" });
  };

  it("fetches weather and stores memory", async () => {
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
      expect(memories[0].text).toContain("72°F");
      expect(memories[0].text).toContain("sunny");
    } finally {
      await h.cleanup();
    }
  });

  it("handles cold weather", async () => {
    withHandlers(weatherCold());
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      const result = await runCronJob(h);

      expect(result.isOk()).toBe(true);
      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories[0].text).toContain("32°F");
      expect(memories[0].text).toContain("snow");
    } finally {
      await h.cleanup();
    }
  });

  it("handles API errors gracefully", async () => {
    withHandlers(weatherError(500));
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
});
