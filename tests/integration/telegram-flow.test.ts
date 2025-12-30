import { afterAll, afterEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCalls } from "@std/testing/mock";
import { createTestContainer, type TestContainer } from "../fixtures/container.ts";
import { createMockGrammyContext, createMockTelegramApi } from "../fixtures/mocks.ts";
import { handleMessage, type BotDeps } from "../../src/plugins/telegram/index.ts";
import type { Context, Filter } from "grammy";

describe("Telegram Message Flow", () => {
  describe("handleMessage", () => {
    it("full flow: stores message, calls LLM, extracts memory, sends response", async () => {
      const testCtx = await createTestContainer({
        anthropic: {
          responses: [
            `I've noted that for you.\n<createMemories>[{"text": "Doctor appointment tomorrow", "date": "2024-01-15"}]</createMemories>`,
          ],
        },
      });

      try {
        const { container, mockAnthropic } = testCtx;
        const mockApi = createMockTelegramApi();

        const grammyCtx = createMockGrammyContext(mockApi, {
          chatId: 123,
          userId: 456,
          username: "testuser",
          text: "Remind me about my doctor appointment tomorrow",
        });

        const deps: BotDeps = {
          config: container.config,
          llm: container.llm,
          memory: container.memory,
          messages: container.messages,
        };

        // Call the actual handler
        await handleMessage(grammyCtx as unknown as Filter<Context, "message">, deps);

        // 1. Verify user message was stored
        const history = await container.messages.getChatHistory({ chatId: "123" });
        expect(history.isOk()).toBe(true);
        const messages = history._unsafeUnwrap();
        expect(messages.length).toBeGreaterThanOrEqual(1);
        expect(messages[0].message).toBe("Remind me about my doctor appointment tomorrow");
        expect(messages[0].isBot).toBe(false);

        // 2. Verify LLM was called
        assertSpyCalls(mockAnthropic.streamSpy, 1);
        const llmCall = mockAnthropic.streamSpy.calls[0];
        expect(llmCall.args[0].messages[0].content).toContain("Remind me about my doctor");

        // 3. Verify memory was extracted and persisted
        const memories = await container.memory.getAllMemories();
        expect(memories.isOk()).toBe(true);
        const memoryList = memories._unsafeUnwrap();
        expect(memoryList).toHaveLength(1);
        expect(memoryList[0].text).toBe("Doctor appointment tomorrow");
        expect(memoryList[0].date).toEqual(new Date("2024-01-15"));

        // 4. Verify bot response was sent via Telegram
        assertSpyCalls(mockApi.sendMessage, 1);
        expect(mockApi.sent[0].chatId).toBe("123");
        expect(mockApi.sent[0].text).toBe("I've noted that for you.");

        // 5. Verify bot response was stored in history
        const finalHistory = await container.messages.getChatHistory({ chatId: "123" });
        const allMessages = finalHistory._unsafeUnwrap();
        expect(allMessages).toHaveLength(2);
        expect(allMessages[1].isBot).toBe(true);
        expect(allMessages[1].message).toBe("I've noted that for you.");
      } finally {
        await testCtx.cleanup();
      }
    });

    it("skips messages starting with /", async () => {
      const testCtx = await createTestContainer({
        anthropic: { responses: ["should not be called"] },
      });

      try {
        const { container, mockAnthropic } = testCtx;
        const mockApi = createMockTelegramApi();

        const grammyCtx = createMockGrammyContext(mockApi, {
          text: "/start",
        });

        await handleMessage(grammyCtx as unknown as Filter<Context, "message">, {
          config: container.config,
          llm: container.llm,
          memory: container.memory,
          messages: container.messages,
        });

        // LLM should NOT be called for commands
        assertSpyCalls(mockAnthropic.streamSpy, 0);
        assertSpyCalls(mockApi.sendMessage, 0);
      } finally {
        await testCtx.cleanup();
      }
    });

    it("handles multiple memory operations in single response", async () => {
      const testCtx = await createTestContainer({
        anthropic: {
          responses: [
            `Done!\n<createMemories>[{"text": "New item"}]</createMemories>\n<editMemories>[{"id": "1", "text": "Updated"}]</editMemories>\n<deleteMemories>["2"]</deleteMemories>`,
          ],
        },
      });

      try {
        const { container } = testCtx;
        const mockApi = createMockTelegramApi();

        // Seed existing memories
        await container.db.insertInto("memories").values([
          { id: 1, text: "Original item", date: null },
          { id: 2, text: "To be deleted", date: null },
        ]).execute();

        const grammyCtx = createMockGrammyContext(mockApi, {
          text: "Update my memories please",
        });

        await handleMessage(grammyCtx as unknown as Filter<Context, "message">, {
          config: container.config,
          llm: container.llm,
          memory: container.memory,
          messages: container.messages,
        });

        const remaining = await container.db
          .selectFrom("memories")
          .selectAll()
          .execute();

        expect(remaining).toHaveLength(2); // 1 created, 1 edited, 1 deleted
        expect(remaining.find((m) => m.text === "Updated")).toBeDefined();
        expect(remaining.find((m) => m.text === "New item")).toBeDefined();
        expect(remaining.find((m) => m.text === "To be deleted")).toBeUndefined();

        // Response should be stripped of tags
        expect(mockApi.sent[0].text).toBe("Done!");
      } finally {
        await testCtx.cleanup();
      }
    });

    it("builds conversation context from chat history", async () => {
      const testCtx = await createTestContainer({
        anthropic: { responses: ["Got it, continuing our conversation."] },
      });

      try {
        const { container, mockAnthropic } = testCtx;
        const mockApi = createMockTelegramApi();

        // Seed prior conversation
        await container.messages.storeChatMessage({
          chatId: "123",
          senderId: "456",
          senderName: "TestUser",
          message: "Hello there",
          isBot: false,
        });
        await container.messages.storeChatMessage({
          chatId: "123",
          senderId: "bot",
          senderName: "Noelle",
          message: "Good day!",
          isBot: true,
        });

        const grammyCtx = createMockGrammyContext(mockApi, {
          chatId: 123,
          userId: 456,
          text: "What did I say earlier?",
        });

        await handleMessage(grammyCtx as unknown as Filter<Context, "message">, {
          config: container.config,
          llm: container.llm,
          memory: container.memory,
          messages: container.messages,
        });

        // Verify LLM received full conversation history
        const llmCall = mockAnthropic.streamSpy.calls[0];
        const llmMessages = llmCall.args[0].messages;

        expect(llmMessages).toHaveLength(4); // 3 messages + [Please continue]
        expect(llmMessages[0].role).toBe("user");
        expect(llmMessages[0].content).toContain("Hello there");
        expect(llmMessages[1].role).toBe("assistant");
        expect(llmMessages[2].role).toBe("user");
        expect(llmMessages[2].content).toContain("What did I say earlier");
      } finally {
        await testCtx.cleanup();
      }
    });

    it("includes memories in system prompt", async () => {
      const testCtx = await createTestContainer({
        anthropic: { responses: ["I see you have a meeting scheduled."] },
      });

      try {
        const { container, mockAnthropic } = testCtx;
        const mockApi = createMockTelegramApi();

        // Seed memories
        await container.db.insertInto("memories").values([
          { text: "Meeting with Bob at 3pm", date: "2024-01-15" },
          { text: "User prefers formal language", date: null },
        ]).execute();

        const grammyCtx = createMockGrammyContext(mockApi, {
          text: "What do I have scheduled?",
        });

        await handleMessage(grammyCtx as unknown as Filter<Context, "message">, {
          config: container.config,
          llm: container.llm,
          memory: container.memory,
          messages: container.messages,
        });

        const llmCall = mockAnthropic.streamSpy.calls[0];
        const systemPrompt = llmCall.args[0].system;

        expect(systemPrompt).toContain("Meeting with Bob");
        expect(systemPrompt).toContain("formal language");
      } finally {
        await testCtx.cleanup();
      }
    });
  });

  describe("error handling", () => {
    it("handles LLM failure gracefully", async () => {
      const testCtx = await createTestContainer({
        anthropic: { failWith: new Error("API connection failed") },
      });

      try {
        const { container } = testCtx;
        const mockApi = createMockTelegramApi();

        const grammyCtx = createMockGrammyContext(mockApi, {
          text: "Hello",
        });

        // Should not throw - handler catches errors
        await handleMessage(grammyCtx as unknown as Filter<Context, "message">, {
          config: container.config,
          llm: container.llm,
          memory: container.memory,
          messages: container.messages,
        });

        // Error message should be sent to user
        assertSpyCalls(mockApi.sendMessage, 1);
        expect(mockApi.sent[0].text).toContain("difficulty processing");
      } finally {
        await testCtx.cleanup();
      }
    });
  });
});
