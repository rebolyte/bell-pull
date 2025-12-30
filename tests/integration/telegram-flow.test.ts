import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCalls } from "@std/testing/mock";
import { createTestHarness } from "../fixtures/container.ts";
import { handleMessage } from "../../src/plugins/telegram/index.ts";

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
  });
});
