import { type Spy, spy } from "@std/testing/mock";
import type Anthropic from "@anthropic-ai/sdk";
import { Logger } from "../../src/services/logger.ts";

type MessageResponse = Anthropic.Messages.Message;
type StreamResponse = { finalMessage: () => Promise<MessageResponse> };

export type MockAnthropicOptions = {
  responses?: string[];
  failWith?: Error;
};

export const makeMessageResponse = (text: string): MessageResponse => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-haiku-3-5-20241022",
  stop_reason: "end_turn",
  stop_sequence: null,
  content: [{ type: "text", text, citations: null }],
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    server_tool_use: null,
    service_tier: null,
  },
});

export const createMockAnthropic = (opts: MockAnthropicOptions = {}) => {
  const responses = opts.responses ?? ["Default mock response"];
  let callIndex = 0;

  // Create the stream implementation that returns a StreamResponse
  const streamImpl = (_params: unknown): StreamResponse => {
    if (opts.failWith) {
      throw opts.failWith;
    }
    const text = responses[callIndex++] ?? responses.at(-1)!;
    return {
      finalMessage: () => Promise.resolve(makeMessageResponse(text)),
    };
  };

  // Wrap in spy to track calls
  const streamSpy = spy(streamImpl);

  return {
    client: {
      messages: {
        stream: streamSpy,
      },
    } as unknown as Anthropic,
    streamSpy,
    getCallCount: () => callIndex,
  };
};

export type MockTelegramApiOptions = {
  failWith?: Error;
};

export type MockTelegramApi = {
  sendMessage: Spy<unknown, [string, string, unknown?], Promise<{ message_id: number }>>;
  sent: Array<{ chatId: string; text: string }>;
};

export const createMockTelegramApi = (opts: MockTelegramApiOptions = {}): MockTelegramApi => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const sendMessage = spy((chatId: string, text: string, _opts?: unknown) => {
    if (opts.failWith) {
      return Promise.reject(opts.failWith);
    }
    sent.push({ chatId, text });
    return Promise.resolve({ message_id: sent.length });
  });

  return { sendMessage, sent };
};

export const silentLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
} as unknown as Logger;

export type MockGrammyContextOptions = {
  chatId?: number;
  userId?: number;
  username?: string;
  firstName?: string;
  text?: string;
  match?: string;
};

export const createMockGrammyContext = (
  mockApi: MockTelegramApi,
  opts: MockGrammyContextOptions = {},
) => {
  const chatId = opts.chatId ?? 123;
  const userId = opts.userId ?? 456;

  return {
    chat: { id: chatId, type: "private" },
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      from: {
        id: userId,
        is_bot: false,
        username: opts.username,
        first_name: opts.firstName ?? "TestUser",
      },
      text: opts.text ?? "Hello",
    },
    api: mockApi,
    match: opts?.match ?? (opts?.text?.startsWith("/") ? opts.text : "/start"),
  };
};
