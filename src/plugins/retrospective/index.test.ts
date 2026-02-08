import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCalls } from "@std/testing/mock";
import { DateTime } from "luxon";
import { createTestHarness } from "../../../tests/fixtures/container.ts";
import { sendWeeklyRetrospective } from "./index.ts";

const makeMockBot = (mockApi: { sendMessage: unknown }) => ({ api: mockApi }) as any;

describe("Weekly Retrospective", () => {
  it("generates retro from metrics and memories, sends via telegram", async () => {
    const h = await createTestHarness({
      anthropic: { responses: ["*Week in Review*\nA solid week overall."] },
      config: { TELEGRAM_CHAT_ID: "test-chat-123" },
    });

    try {
      const today = DateTime.fromISO("2024-06-15", { zone: "utc" });

      await h.container.db.insertInto("memories").values([
        { text: "Watched: The Holdovers", date: "2024-06-12" },
      ]).execute();

      await h.container.metrics.record([
        {
          date: "2024-06-10",
          metric: "steps",
          value: 8000,
          unit: "count",
          source: "apple-health",
        },
        {
          date: "2024-06-11",
          metric: "steps",
          value: 9000,
          unit: "count",
          source: "apple-health",
        },
      ]);

      const result = await sendWeeklyRetrospective(
        makeMockBot(h.mockApi),
        h.container,
        "test-chat-123",
        today,
      );

      expect(result.isOk()).toBe(true);
      assertSpyCalls(h.mockAnthropic.streamSpy, 1);

      const prompt =
        (h.mockAnthropic.streamSpy.calls[0].args[0] as { messages: { content?: string }[] })
          .messages[0].content as string;
      expect(prompt).toContain("steps:");
      expect(prompt).toContain("Watched: The Holdovers");

      expect(h.mockApi.sent).toEqual([
        { chatId: "test-chat-123", text: "*Week in Review*\nA solid week overall." },
      ]);

      const memories = await h.container.db
        .selectFrom("memories")
        .selectAll()
        .execute();
      const retro = memories.find((m) => m.text.startsWith("Weekly review:"));
      expect(retro).toBeDefined();
      expect(retro!.date).toBe("2024-06-15");
    } finally {
      await h.cleanup();
    }
  });

  it("handles empty metrics gracefully", async () => {
    const h = await createTestHarness({
      anthropic: { responses: ["Quiet week."] },
    });

    try {
      const today = DateTime.fromISO("2024-06-15", { zone: "utc" });

      const result = await sendWeeklyRetrospective(
        makeMockBot(h.mockApi),
        h.container,
        "test-chat",
        today,
      );

      expect(result.isOk()).toBe(true);

      const prompt =
        (h.mockAnthropic.streamSpy.calls[0].args[0] as { messages: { content?: string }[] })
          .messages[0].content as string;
      expect(prompt).toContain("No metrics data");
    } finally {
      await h.cleanup();
    }
  });

  it("returns error when no chat ID configured", async () => {
    const h = await createTestHarness({
      anthropic: { responses: ["test"] },
      config: { TELEGRAM_CHAT_ID: "" },
    });

    try {
      const result = await sendWeeklyRetrospective(
        makeMockBot(h.mockApi),
        h.container,
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("No chat ID");
    } finally {
      await h.cleanup();
    }
  });

  it("stores bot response in message history", async () => {
    const h = await createTestHarness({
      anthropic: { responses: ["Weekly summary here."] },
    });

    try {
      const today = DateTime.fromISO("2024-06-15", { zone: "utc" });
      await sendWeeklyRetrospective(
        makeMockBot(h.mockApi),
        h.container,
        "test-chat-123",
        today,
      );

      const history = (await h.container.messages.getChatHistory({ chatId: "test-chat-123" }))
        ._unsafeUnwrap();
      expect(history[0]).toMatchObject({ isBot: true, message: "Weekly summary here." });
    } finally {
      await h.cleanup();
    }
  });
});
