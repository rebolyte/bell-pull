import { spy, type Spy } from "@std/testing/mock";
import type Anthropic from "@anthropic-ai/sdk";

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
  content: [{ type: "text", text }],
  usage: { input_tokens: 100, output_tokens: 50 },
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

export type MockTelegramApi = {
  sendMessage: Spy<[string, string, unknown?], Promise<{ message_id: number }>>;
  sent: Array<{ chatId: string; text: string }>;
};

export const createMockTelegramApi = (): MockTelegramApi => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const sendMessage = spy((chatId: string, text: string, _opts?: unknown) => {
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
};
