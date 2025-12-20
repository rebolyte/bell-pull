import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { useHarness } from "../../utils/harness.ts";
import { makeMessagesDomain, MessagesDomain } from "./index.ts";

describe("Messages Domain", () => {
  const harness = useHarness();
  let messagesDomain: MessagesDomain;
  const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any;
  const config = { port: 3000, host: "0.0.0.0", env: "development" } as any;

  beforeAll(async () => {
    await harness.setup();
  });

  beforeEach(async () => {
    await harness.reset();
    messagesDomain = makeMessagesDomain({ db: harness.db, logger, config });
  });

  afterAll(async () => {
    await harness.teardown();
  });

  describe("storeChatMessage", () => {
    it("should store and return a message with generated id", async () => {
      const input = {
        chatId: "chat_123",
        senderId: "user_456",
        senderName: "John Doe",
        message: "Hello world",
        isBot: false,
      };

      const result = await messagesDomain.storeChatMessage(input);
      const stored = result._unsafeUnwrap();

      expect(stored.chatId).toEqual(input.chatId);
      expect(stored.message).toEqual(input.message);
      expect(typeof stored.id).toBe("number");
    });
  });

  describe("getChatHistory", () => {
    it("should retrieve messages for a given chat", async () => {
      await messagesDomain.storeChatMessage({
        chatId: "chat_123",
        senderId: "user_456",
        senderName: "John Doe",
        message: "Hello world",
        isBot: false,
      });

      const result = await messagesDomain.getChatHistory({ chatId: "chat_123" });
      const history = result._unsafeUnwrap();

      expect(history.length).toBe(1);
      expect(history[0]).toMatchObject({
        chatId: "chat_123",
        message: "Hello world",
      });
    });

    it("should return empty array for unknown chat", async () => {
      const result = await messagesDomain.getChatHistory({ chatId: "nonexistent" });
      const history = result._unsafeUnwrap();

      expect(history.length).toBe(0);
    });
  });
});
