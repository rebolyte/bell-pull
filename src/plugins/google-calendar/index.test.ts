import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { mswMock, withHandlers } from "../../../tests/fixtures/mocks/server.ts";
import {
  calendarEmpty,
  calendarSuccess,
  calendarUnauthorized,
  calendarWithEvents,
} from "./mock.ts";
import { createTestHarness } from "../../../tests/fixtures/container.ts";
import { googleCalendarPlugin } from "./index.ts";

describe("Google Calendar Cron Job", () => {
  beforeAll(() => {
    const defaultHandlers = [
      calendarSuccess(),
    ];
    mswMock.listen(defaultHandlers);
  });
  afterAll(() => mswMock.close());
  afterEach(() => mswMock.resetHandlers());

  const setupPlugin = async (h: Awaited<ReturnType<typeof createTestHarness>>) => {
    const result = await h.container.plugins.setConfig("google-calendar", {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      calendarId: "primary",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    if (result.isErr()) throw result.error;
  };

  const runCronJob = (h: Awaited<ReturnType<typeof createTestHarness>>) => {
    const cronJobs = typeof googleCalendarPlugin.cronJobs === "function"
      ? googleCalendarPlugin.cronJobs({ calendarId: "primary" } as any)
      : googleCalendarPlugin.cronJobs!;
    const cronJob = cronJobs[0];
    return cronJob.run(h.container, { name: "test", schedule: "" });
  };

  it("fetches calendar events and stores memories", async () => {
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
      expect(memories[0].text).toContain("Calendar: Test Event");
    } finally {
      await h.cleanup();
    }
  });

  it("handles multiple events", async () => {
    withHandlers(calendarWithEvents(
      { summary: "Event 1", start: { dateTime: new Date(Date.now() + 86400000).toISOString() } },
      { summary: "Event 2", start: { dateTime: new Date(Date.now() + 172800000).toISOString() } },
    ));
    const h = await createTestHarness();
    try {
      await setupPlugin(h);
      const result = await runCronJob(h);

      expect(result.isOk()).toBe(true);
      const memories = await h.container.db.selectFrom("memories").selectAll().execute();
      expect(memories).toHaveLength(2);
      expect(memories[0].text).toContain("Event 1");
      expect(memories[1].text).toContain("Event 2");
    } finally {
      await h.cleanup();
    }
  });

  it("handles empty calendar", async () => {
    withHandlers(calendarEmpty());
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

  it("handles unauthorized errors", async () => {
    withHandlers(calendarUnauthorized());
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
