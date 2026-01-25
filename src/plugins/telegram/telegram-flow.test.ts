import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCalls } from "@std/testing/mock";
import { createTestHarness } from "../../../tests/fixtures/container.ts";
import { handleHelpCommand, handleMessage, handleStartCommand } from "./index.ts";

describe("Telegram Message Flow", () => {
  describe("handleMessage", () => {
    it("full flow: stores message, calls LLM, extracts memory, sends response", async () => {
      const h = await createTestHarness({
        anthropic: {
          responses: [
            `I've noted that for you.\n<createMemories>[{"text": "Doctor appointment tomorrow", "date": "2024-01-15"}]</createMemories>`,
          ],
        },
      });

      try {
        await handleMessage(
          h.createCtx({ text: "Remind me about my doctor appointment tomorrow" }),
          h.deps,
        );

        // Verify user message stored
        const history = await h.container.messages.getChatHistory({ chatId: "123" });
        const messages = history._unsafeUnwrap();
        expect(messages[0]).toMatchObject({
          message: "Remind me about my doctor appointment tomorrow",
          isBot: false,
        });

        // Verify LLM called with user message
        assertSpyCalls(h.mockAnthropic.streamSpy, 1);
        expect(h.mockAnthropic.streamSpy.calls[0].args[0].messages[0]).toMatchObject({
          role: "user",
          content: expect.stringContaining("Remind me about my doctor"),
        });

        // Verify memory persisted
        const memories = (await h.container.memory.getAllMemories())._unsafeUnwrap();
        expect(memories).toHaveLength(1);
        expect(memories[0]).toMatchObject({
          text: "Doctor appointment tomorrow",
          date: new Date("2024-01-15"),
        });

        // Verify response sent and stored
        expect(h.mockApi.sent).toEqual([{ chatId: "123", text: "I've noted that for you." }]);
        expect(messages).toHaveLength(2);
        expect(messages[1]).toMatchObject({ message: "I've noted that for you.", isBot: true });
      } finally {
        await h.cleanup();
      }
    });

    it("skips messages starting with /", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["should not be called"] },
      });

      try {
        await handleMessage(h.createCtx({ text: "/start" }), h.deps);

        assertSpyCalls(h.mockAnthropic.streamSpy, 0);
        assertSpyCalls(h.mockApi.sendMessage, 0);
      } finally {
        await h.cleanup();
      }
    });

    it("handles multiple memory operations in single response", async () => {
      const h = await createTestHarness({
        anthropic: {
          responses: [
            `Done!\n<createMemories>[{"text": "New item"}]</createMemories>\n<editMemories>[{"id": "1", "text": "Updated"}]</editMemories>\n<deleteMemories>["2"]</deleteMemories>`,
          ],
        },
      });

      try {
        await h.container.db.insertInto("memories").values([
          { id: 1, text: "Original item", date: null },
          { id: 2, text: "To be deleted", date: null },
        ]).execute();

        await handleMessage(h.createCtx({ text: "Update my memories" }), h.deps);

        const remaining = await h.container.db.selectFrom("memories").selectAll().execute();
        expect(remaining.map((m) => m.text).sort()).toEqual(["New item", "Updated"]);
        expect(h.mockApi.sent[0].text).toBe("Done!");
      } finally {
        await h.cleanup();
      }
    });

    it("builds conversation context from chat history", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Continuing our conversation."] },
      });

      try {
        await h.container.messages.storeChatMessage({
          chatId: "123",
          senderId: "456",
          senderName: "TestUser",
          message: "Hello there",
          isBot: false,
        });
        await h.container.messages.storeChatMessage({
          chatId: "123",
          senderId: "bot",
          senderName: "Noelle",
          message: "Good day!",
          isBot: true,
        });

        await handleMessage(h.createCtx({ text: "What did I say earlier?" }), h.deps);

        const llmMessages = h.mockAnthropic.streamSpy.calls[0].args[0].messages;
        expect(llmMessages).toEqual([
          { role: "user", content: "TestUser says: Hello there" },
          { role: "assistant", content: "Good day!" },
          { role: "user", content: expect.stringContaining("What did I say earlier") },
          { role: "user", content: "[Please continue]" },
        ]);
      } finally {
        await h.cleanup();
      }
    });

    it("includes memories in system prompt", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["I see you have a meeting scheduled."] },
      });

      try {
        await h.container.db.insertInto("memories").values([
          { text: "Meeting with Bob at 3pm", date: "2024-01-15" },
          { text: "User prefers formal language", date: null },
        ]).execute();

        await handleMessage(h.createCtx({ text: "What do I have scheduled?" }), h.deps);

        const systemPrompt = h.mockAnthropic.streamSpy.calls[0].args[0].system;
        expect(systemPrompt).toContain("Meeting with Bob");
        expect(systemPrompt).toContain("formal language");
      } finally {
        await h.cleanup();
      }
    });
  });

  describe("error handling", () => {
    it("handles LLM failure gracefully", async () => {
      const h = await createTestHarness({
        anthropic: { failWith: new Error("API connection failed") },
      });

      try {
        await handleMessage(h.createCtx({ text: "Hello" }), h.deps);

        assertSpyCalls(h.mockApi.sendMessage, 1);
        expect(h.mockApi.sent[0].text).toContain("difficulty processing");
      } finally {
        await h.cleanup();
      }
    });

    it("handles DB failure gracefully", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["test"] },
      });

      try {
        await h.container.db.destroy();
        await handleMessage(h.createCtx({ text: "Hello" }), h.deps);

        assertSpyCalls(h.mockApi.sendMessage, 1);
        expect(h.mockApi.sent[0].text).toContain("trouble accessing");
      } finally {
        // already destroyed
      }
    });

    it("handles Telegram API failure gracefully", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Here is my response."] },
        telegram: { failWith: new Error("Telegram API unavailable") },
      });

      try {
        await handleMessage(h.createCtx({ text: "Hello" }), h.deps);

        // sendMessage called twice: once for response (fails), once for error msg (also fails)
        assertSpyCalls(h.mockApi.sendMessage, 2);
      } finally {
        await h.cleanup();
      }
    });
  });

  describe("handleStartCommand", () => {
    it("sends welcome message and stores in history", async () => {
      const h = await createTestHarness({
        anthropic: { responses: [] },
      });

      try {
        await handleStartCommand(h.createCtx({ text: "/start" }), h.deps);

        assertSpyCalls(h.mockApi.sendMessage, 1);
        expect(h.mockApi.sent[0].text).toContain("Good day");
        expect(h.mockApi.sent[0].text).toContain("Noelle");

        const history = (await h.container.messages.getChatHistory({ chatId: "123" }))
          ._unsafeUnwrap();
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ isBot: true });
      } finally {
        await h.cleanup();
      }
    });
  });

  describe("handleHelpCommand", () => {
    it("sends help message with available commands", async () => {
      const h = await createTestHarness({
        anthropic: { responses: [] },
      });

      try {
        await handleHelpCommand(h.createCtx({ text: "/help" }), h.deps);

        assertSpyCalls(h.mockApi.sendMessage, 1);
        expect(h.mockApi.sent[0].text).toContain("personal assistant");
        expect(h.mockApi.sent[0].text).toContain("/start");
        expect(h.mockApi.sent[0].text).toContain("/help");
      } finally {
        await h.cleanup();
      }
    });
  });

  describe("message chunking", () => {
    it("splits long responses into multiple messages under 4000 chars each", async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: ${"x".repeat(50)}`);
      const longResponse = lines.join("\n");
      const h = await createTestHarness({
        anthropic: { responses: [longResponse] },
      });

      try {
        await handleMessage(h.createCtx({ text: "Give me a long response" }), h.deps);

        expect(h.mockApi.sent.length).toBeGreaterThan(1);
        h.mockApi.sent.forEach((msg) => {
          expect(msg.text.length).toBeLessThanOrEqual(4000);
        });
        const combined = h.mockApi.sent.map((m) => m.text).join("\n");
        expect(combined).toContain("Line 1:");
        expect(combined).toContain("Line 100:");
      } finally {
        await h.cleanup();
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty message text", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["I didn't catch that."] },
      });

      try {
        await handleMessage(h.createCtx({ text: "" }), h.deps);

        assertSpyCalls(h.mockAnthropic.streamSpy, 1);
        expect(h.mockApi.sent[0].text).toBe("I didn't catch that.");

        const history = (await h.container.messages.getChatHistory({ chatId: "123" }))
          ._unsafeUnwrap();
        expect(history[0]).toMatchObject({ message: "", isBot: false });
        expect(history[1]).toMatchObject({ message: "I didn't catch that.", isBot: true });
      } finally {
        await h.cleanup();
      }
    });

    it("adds intake prompt when fewer than 25 memories", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Hello!"] },
      });

      try {
        await handleMessage(h.createCtx({ text: "Hi" }), h.deps);

        const systemPrompt = h.mockAnthropic.streamSpy.calls[0].args[0].system;
        expect(systemPrompt).toContain("intake");
      } finally {
        await h.cleanup();
      }
    });

    it("omits intake prompt when 25+ memories exist", async () => {
      const h = await createTestHarness({
        anthropic: { responses: ["Hello!"] },
      });

      try {
        const memories = Array.from(
          { length: 25 },
          (_, i) => ({ text: `Memory ${i}`, date: null }),
        );
        await h.container.db.insertInto("memories").values(memories).execute();

        await handleMessage(h.createCtx({ text: "Hi" }), h.deps);

        const systemPrompt = h.mockAnthropic.streamSpy.calls[0].args[0].system as string;
        expect(systemPrompt.toLowerCase()).not.toContain("intake");
      } finally {
        await h.cleanup();
      }
    });
  });
});
