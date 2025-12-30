import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCalls, spy, stub } from "@std/testing/mock";
import { DateTime } from "luxon";
import { createTestContainer, type TestContainer } from "../fixtures/container.ts";
import { sendDailyBriefing } from "../../src/plugins/telegram/briefing.ts";

describe("Daily Briefing", () => {
  let ctx: TestContainer;

  beforeAll(async () => {
    ctx = await createTestContainer({
      anthropic: {
        responses: [
          "Good morning! Here's your briefing:\n\n**Today's Schedule:**\n- 10:00 AM: Doctor appointment\n- 2:00 PM: Team standup\n\n**Reminders:**\n- Pick up dry cleaning\n\nHave a wonderful day!",
        ],
      },
      config: {
        TELEGRAM_CHAT_ID: "test-chat-123",
        TIMEZONE: "America/Los_Angeles",
      },
    });
  });

  beforeEach(async () => {
    await ctx.container.db.deleteFrom("memories").execute();
    await ctx.container.db.deleteFrom("messages").execute();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("sendDailyBriefing", () => {
    it("generates briefing from memories and sends via telegram", async () => {
      const { container, mockAnthropic } = ctx;

      // Seed memories - dated for today and undated background
      const today = DateTime.now().setZone("America/Los_Angeles").toFormat("yyyy-MM-dd");
      await container.db.insertInto("memories").values([
        { text: "Doctor appointment at 10am", date: today },
        { text: "Team standup at 2pm", date: today },
        { text: "User prefers concise morning briefs", date: null },
      ]).execute();

      // Create mock bot with spied API
      const sentMessages: Array<{ chatId: string; text: string }> = [];
      const mockBot = {
        api: {
          sendMessage: spy((chatId: string, text: string, _opts?: unknown) => {
            sentMessages.push({ chatId, text });
            return Promise.resolve({ message_id: sentMessages.length });
          }),
        },
      };

      const result = await sendDailyBriefing(
        mockBot as any,
        container,
        "test-chat-123",
        DateTime.fromISO(today, { zone: "America/Los_Angeles" }),
      );

      expect(result.isOk()).toBe(true);

      // Verify LLM was called
      assertSpyCalls(mockAnthropic.streamSpy, 1);

      // Verify the prompt contained our memories
      const llmCall = mockAnthropic.streamSpy.calls[0];
      const messages = llmCall.args[0].messages;
      expect(messages[0].content).toContain("Doctor appointment");
      expect(messages[0].content).toContain("Team standup");
      expect(messages[0].content).toContain("concise morning briefs");

      // Verify telegram message was sent
      assertSpyCalls(mockBot.api.sendMessage, 1);
      expect(sentMessages[0].chatId).toBe("test-chat-123");
      expect(sentMessages[0].text).toContain("Good morning");
    });

    it("includes weekday cheatsheet in prompt", async () => {
      const { container, mockAnthropic } = ctx;

      const mockBot = {
        api: {
          sendMessage: spy(() => Promise.resolve({ message_id: 1 })),
        },
      };

      const fixedDate = DateTime.fromISO("2024-01-15", { zone: "America/Los_Angeles" }); // Monday

      await sendDailyBriefing(mockBot as any, container, "123", fixedDate);

      const llmCall = mockAnthropic.streamSpy.calls[0];
      const prompt = llmCall.args[0].messages[0].content as string;

      // Should contain weekday references
      expect(prompt).toContain("Monday");
      expect(prompt).toContain("Today:");
      expect(prompt).toContain("Tomorrow:");
    });

    it("returns error when no chat ID configured", async () => {
      const noChatIdCtx = await createTestContainer({
        anthropic: { responses: ["test"] },
        config: { TELEGRAM_CHAT_ID: "" },
      });

      try {
        const mockBot = { api: { sendMessage: spy(() => Promise.resolve({ message_id: 1 })) } };

        const result = await sendDailyBriefing(
          mockBot as any,
          noChatIdCtx.container,
          undefined, // no chatId override
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().type).toBe("validation");
        expect(result._unsafeUnwrapErr().message).toContain("No chat ID");
      } finally {
        await noChatIdCtx.cleanup();
      }
    });

    it("handles empty memories gracefully", async () => {
      const { container, mockAnthropic } = ctx;

      // No memories seeded

      const mockBot = {
        api: {
          sendMessage: spy(() => Promise.resolve({ message_id: 1 })),
        },
      };

      const result = await sendDailyBriefing(mockBot as any, container, "123");

      expect(result.isOk()).toBe(true);

      // LLM should still be called with "no memories" indicator
      const llmCall = mockAnthropic.streamSpy.calls[0];
      const prompt = llmCall.args[0].messages[0].content as string;
      expect(prompt).toContain("No stored memories");
    });

    it("stores bot response in message history", async () => {
      const { container } = ctx;

      await container.db.insertInto("memories").values([
        { text: "Test memory", date: null },
      ]).execute();

      const mockBot = {
        api: {
          sendMessage: spy(() => Promise.resolve({ message_id: 1 })),
        },
      };

      await sendDailyBriefing(mockBot as any, container, "test-chat-123");

      // Verify message was stored
      const history = await container.messages.getChatHistory({ chatId: "test-chat-123" });
      expect(history.isOk()).toBe(true);

      const messages = history._unsafeUnwrap();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].isBot).toBe(true);
      expect(messages[0].message).toContain("Good morning");
    });
  });

  describe("memory formatting", () => {
    it("separates dated and undated memories in prompt", async () => {
      const { container, mockAnthropic } = ctx;

      await container.db.insertInto("memories").values([
        { text: "Dated event", date: "2024-01-15" },
        { text: "Background info", date: null },
      ]).execute();

      const mockBot = {
        api: { sendMessage: spy(() => Promise.resolve({ message_id: 1 })) },
      };

      await sendDailyBriefing(mockBot as any, container, "123");

      const llmCall = mockAnthropic.streamSpy.calls[0];
      const prompt = llmCall.args[0].messages[0].content as string;

      // Memory domain formats dated/undated separately
      expect(prompt).toContain("Dated memories");
      expect(prompt).toContain("General memories");
    });
  });
});
