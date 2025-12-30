import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCall, assertSpyCalls } from "@std/testing/mock";
import { createTestContainer, type TestContainer } from "../fixtures/container.ts";
import { createMockTelegramApi } from "../fixtures/mocks.ts";

describe("Telegram Message Flow", () => {
  let ctx: TestContainer;

  beforeAll(async () => {
    ctx = await createTestContainer({
      anthropic: {
        responses: [
          `I've noted that for you.\n<createMemories>[{"text": "Doctor appointment tomorrow", "date": "2024-01-15"}]</createMemories>`,
        ],
      },
    });
  });

  afterEach(async () => {
    await ctx.container.db.deleteFrom("memories").execute();
    await ctx.container.db.deleteFrom("messages").execute();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("handleMessage flow", () => {
    it("stores user message, calls LLM, extracts and persists memory", async () => {
      const { container, mockAnthropic } = ctx;
      const { messages, memory } = container;

      // 1. Store user message (simulating what handleMessage does)
      const storeResult = await messages.storeChatMessage({
        chatId: "123",
        senderId: "456",
        senderName: "TestUser",
        message: "Remind me about my doctor appointment tomorrow",
        isBot: false,
      });
      expect(storeResult.isOk()).toBe(true);

      // 2. Get memories + history (as handleMessage does)
      const memoriesResult = await memory.getAllMemories();
      expect(memoriesResult.isOk()).toBe(true);
      const existingMemories = memoriesResult._unsafeUnwrap();

      const historyResult = await messages.getChatHistory({ chatId: "123" });
      expect(historyResult.isOk()).toBe(true);
      const history = historyResult._unsafeUnwrap();

      // 3. Format for LLM and call
      const formattedMemories = memory.formatMemoriesForPrompt(existingMemories);
      expect(formattedMemories).toBe("No stored memories are available.");

      const llmResult = await container.llm.generateText({
        messages: messages.mapToLLM(history),
        systemPrompt: "Test system prompt",
      });
      expect(llmResult.isOk()).toBe(true);

      // Verify Anthropic was called
      assertSpyCalls(mockAnthropic.streamSpy, 1);
      assertSpyCall(mockAnthropic.streamSpy, 0, {
        args: [{
          model: "claude-haiku-3-5-20241022",
          max_tokens: 1024,
          thinking: { type: "disabled" },
          temperature: 0.7,
          messages: [{ role: "user", content: "TestUser says: Remind me about my doctor appointment tomorrow" }],
          system: "Test system prompt",
        }],
      });

      // 4. Extract memories from LLM response
      const llmResponse = llmResult._unsafeUnwrap();
      const extractResult = memory.extractMemories(llmResponse);
      expect(extractResult.isOk()).toBe(true);

      const analysis = extractResult._unsafeUnwrap();
      expect(analysis.memories).toHaveLength(1);
      expect(analysis.memories[0].text).toBe("Doctor appointment tomorrow");
      expect(analysis.memories[0].date).toBe("2024-01-15");
      expect(analysis.response).toBe("I've noted that for you.");

      // 5. Update memories in DB
      const updateResult = await memory.updateMemories(analysis);
      expect(updateResult.isOk()).toBe(true);

      // 6. Verify memory was persisted
      const finalMemoriesResult = await memory.getAllMemories();
      expect(finalMemoriesResult.isOk()).toBe(true);
      const finalMemories = finalMemoriesResult._unsafeUnwrap();
      expect(finalMemories).toHaveLength(1);
      expect(finalMemories[0].text).toBe("Doctor appointment tomorrow");
    });

    it("handles LLM response with multiple memory operations", async () => {
      const multiOpCtx = await createTestContainer({
        anthropic: {
          responses: [
            `Done!\n<createMemories>[{"text": "New item"}]</createMemories>\n<editMemories>[{"id": "1", "text": "Updated"}]</editMemories>\n<deleteMemories>["2"]</deleteMemories>`,
          ],
        },
      });

      try {
        // Seed some existing memories
        await multiOpCtx.container.db.insertInto("memories").values([
          { id: 1, text: "Original item", date: null },
          { id: 2, text: "To be deleted", date: null },
        ]).execute();

        const llmResult = await multiOpCtx.container.llm.generateText({
          messages: [{ role: "user", content: "test" }],
        });

        const analysis = multiOpCtx.container.memory.extractMemories(llmResult._unsafeUnwrap());
        expect(analysis._unsafeUnwrap().memories).toHaveLength(1);
        expect(analysis._unsafeUnwrap().editMemories).toHaveLength(1);
        expect(analysis._unsafeUnwrap().deleteMemories).toHaveLength(1);

        await multiOpCtx.container.memory.updateMemories(analysis._unsafeUnwrap());

        const remaining = await multiOpCtx.container.db
          .selectFrom("memories")
          .selectAll()
          .execute();

        expect(remaining).toHaveLength(2); // 1 created, 1 edited, 1 deleted
        expect(remaining.find((m) => m.text === "Updated")).toBeDefined();
        expect(remaining.find((m) => m.text === "New item")).toBeDefined();
        expect(remaining.find((m) => m.text === "To be deleted")).toBeUndefined();
      } finally {
        await multiOpCtx.cleanup();
      }
    });

    it("stores bot response in message history", async () => {
      const { container } = ctx;
      const mockApi = createMockTelegramApi();

      // Store user message
      await container.messages.storeChatMessage({
        chatId: "123",
        senderId: "456",
        senderName: "TestUser",
        message: "Hello",
        isBot: false,
      });

      // Store bot response (simulating sendAndStoreMessage)
      await container.messages.storeChatMessage({
        chatId: "123",
        senderId: "MechMaidBot",
        senderName: "Noelle",
        message: "Good day, how may I assist you?",
        isBot: true,
      });

      const history = await container.messages.getChatHistory({ chatId: "123" });
      expect(history.isOk()).toBe(true);

      const messages = history._unsafeUnwrap();
      expect(messages).toHaveLength(2);
      expect(messages[0].isBot).toBe(false);
      expect(messages[1].isBot).toBe(true);

      // Verify LLM formatting
      const llmMessages = container.messages.mapToLLM(messages);
      expect(llmMessages).toHaveLength(3); // user, assistant, [Please continue]
      expect(llmMessages[0].role).toBe("user");
      expect(llmMessages[1].role).toBe("assistant");
      expect(llmMessages[2].content).toBe("[Please continue]");
    });
  });

  describe("error handling", () => {
    it("handles LLM API failure gracefully", async () => {
      const failingCtx = await createTestContainer({
        anthropic: {
          failWith: new Error("API connection failed"),
        },
      });

      try {
        const result = await failingCtx.container.llm.generateText({
          messages: [{ role: "user", content: "test" }],
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().type).toBe("llm");
        expect(result._unsafeUnwrapErr().message).toBe("Claude API call failed");
      } finally {
        await failingCtx.cleanup();
      }
    });
  });
});
