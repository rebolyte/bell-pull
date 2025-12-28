import { Bot, Context, Filter, webhookCallback as telegramWebhookCallback } from "grammy";
import { ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import type { AppConfig } from "../../services/config.ts";
import type { LLM } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import { makeSystemPrompt } from "./prompt.ts";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { type AppError, telegramError } from "../../errors.ts";

export const BOT_SENDER_ID = "MechMaidBot";
export const BOT_SENDER_NAME = "Noelle";

const APOLOGY =
  "I do apologize, but I seem to be experiencing some difficulty at the moment. Perhaps we could try again shortly.";

type BotDeps = {
  config: AppConfig;
  llm: LLM;
  memory: MemoryDomain;
  messages: MessagesDomain;
};

type MessageContext = {
  chatId: string;
  senderId: string;
  senderName: string;
  messageText: string;
};

const extractContext = (ctx: Filter<Context, "message">): MessageContext => ({
  chatId: ctx.chat.id.toString(),
  senderId: ctx.message.from.id.toString(),
  senderName: ctx.message.from.username || ctx.message.from.first_name || "Sir/Madam",
  messageText: ctx.message.text || "",
});

export const makeBot = (
  { config, llm, memory, messages }: BotDeps,
) => {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  const handleMessage = async (ctx: Filter<Context, "message">) => {
    const msgCtx = extractContext(ctx);

    console.log("received:", msgCtx.messageText.slice(0, 100) + "...");

    if (msgCtx.messageText.startsWith("/")) return;

    const reply = (text: string) =>
      ResultAsync.fromPromise(ctx.reply(text), telegramError("Failed to send reply"));

    const result = await messages
      .storeChatMessage({
        chatId: msgCtx.chatId,
        senderId: msgCtx.senderId,
        senderName: msgCtx.senderName,
        message: msgCtx.messageText,
        isBot: false,
      })
      .andThen(() =>
        ResultAsync.combine([
          memory.getAllMemories(),
          messages.getChatHistory({ chatId: msgCtx.chatId }),
        ])
      )
      .map(([memories, history]) => ({
        systemPrompt: makeSystemPrompt(memory.formatMemoriesForPrompt(memories)),
        llmMessages: history.length > 0 ? messages.mapToLLM(history) : [],
      }))
      .andThen(({ systemPrompt, llmMessages }) =>
        llm.generateText({ messages: llmMessages, systemPrompt })
      )
      .andThen((responseText) => {
        const analysisResult = memory.extractMemories(responseText);
        return analysisResult.asyncAndThen((analysis) =>
          memory.updateMemories(analysis).map(() => responseText)
        );
      })
      .andThen((responseText) =>
        reply(responseText).andThen(() =>
          messages.storeChatMessage({
            chatId: msgCtx.chatId,
            senderId: BOT_SENDER_ID,
            senderName: BOT_SENDER_NAME,
            message: responseText,
            isBot: true,
          })
        )
      );

    result.match(
      () => {},
      (error: AppError) => {
        console.error(`[${error.type}] ${error.message}`, error.cause);
        reply(APOLOGY);
      },
    );
  };

  bot.on("message", handleMessage);

  return bot;
};

export const telegramPlugin: Plugin = {
  name: "telegram",
  init: (app, container) => {
    const { config, llm, memory, messages } = container;
    const bot = makeBot({ config, llm, memory, messages });

    // https://grammy.dev/guide/deployment-types
    app.use("/webhook/telegram", telegramWebhookCallback(bot, "hono"));
  },
  cronJobs: [{
    schedule: "0 9 * * *",
    run: async () => {
      console.log("sending daily brief to Telegram...");
    },
  }],
};
