import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCalls } from "@std/testing/mock";
import { DateTime } from "luxon";
import { createTestHarness } from "../fixtures/container.ts";
import { sendDailyBriefing } from "../../src/plugins/telegram/briefing.ts";

const makeMockBot = (mockApi: { sendMessage: unknown }) => ({ api: mockApi }) as any;

describe("Daily Briefing", () => {
  describe("sendDailyBriefing", () => {
    it("generates briefing from memories and sends via telegram", async () => {
      const h = await createTestHarness({
        anthropic: {
          responses: ["Good morning! Here's your briefing for today."],
        },
        config: { TELEGRAM_CHAT_ID: "test-chat-123" },
      });

      try {
        const today = DateTime.now().setZone("America/Los_Angeles").toFormat("yyyy-MM-dd");
        await h.container.db.insertInto("memories").values([
          { text: "Doctor appointment at 10am", date: today },
          { text: "User prefers concise briefs", date: null },
        ]).execute();

        const result = await sendDailyBriefing(
          makeMockBot(h.mockApi),
          h.container,
          "test-chat-123",
          DateTime.fromISO(today, { zone: "America/Los_Angeles" }),
        );

        expect(result.isOk()).toBe(true);
        assertSpyCalls(h.mockAnthropic.streamSpy, 1);

        const prompt = h.mockAnthropic.streamSpy.calls[0].args[0].messages[0].content as string;
        expect(prompt).toContain("Doctor appointment");
        expect(prompt).toContain("concise briefs");

        expect(h.mockApi.sent).toEqual([
          { chatId: "test-chat-123", text: "Good morning! Here's your briefing for today." },
        ]);
      } finally {
        await h.cleanup();
      }
    });

    it("includes weekday cheatsheet in prompt", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Your briefing."] },
      });

      try {
        const fixedDate = DateTime.fromISO("2024-01-15", { zone: "America/Los_Angeles" }); // Monday
        await sendDailyBriefing(makeMockBot(h.mockApi), h.container, "123", fixedDate);

        const prompt = h.mockAnthropic.streamSpy.calls[0].args[0].messages[0].content as string;
        expect(prompt).toMatch(/Today:.*Monday/);
        expect(prompt).toMatch(/Tomorrow:.*Tuesday/);
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
        const result = await sendDailyBriefing(makeMockBot(h.mockApi), h.container);

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toMatchObject({
          type: "validation",
          message: expect.stringContaining("No chat ID"),
        });
      } finally {
        await h.cleanup();
      }
    });

    it("handles empty memories gracefully", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["No events today."] },
      });

      try {
        const result = await sendDailyBriefing(makeMockBot(h.mockApi), h.container, "123");

        expect(result.isOk()).toBe(true);
        const prompt = h.mockAnthropic.streamSpy.calls[0].args[0].messages[0].content as string;
        expect(prompt).toContain("No stored memories");
      } finally {
        await h.cleanup();
      }
    });

    it("stores bot response in message history", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Good morning!"] },
      });

      try {
        await sendDailyBriefing(makeMockBot(h.mockApi), h.container, "test-chat-123");

        const history = (await h.container.messages.getChatHistory({ chatId: "test-chat-123" }))
          ._unsafeUnwrap();
        expect(history[0]).toMatchObject({ isBot: true, message: "Good morning!" });
      } finally {
        await h.cleanup();
      }
    });

    it("separates dated and undated memories in prompt", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Briefing."] },
      });

      try {
        await h.container.db.insertInto("memories").values([
          { text: "Dated event", date: "2024-01-15" },
          { text: "Background info", date: null },
        ]).execute();

        await sendDailyBriefing(makeMockBot(h.mockApi), h.container, "123");

        const prompt = h.mockAnthropic.streamSpy.calls[0].args[0].messages[0].content as string;
        expect(prompt).toContain("Dated memories");
        expect(prompt).toContain("General memories");
      } finally {
        await h.cleanup();
      }
    });
  });
});
