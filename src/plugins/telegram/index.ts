import { Bot, Context, Filter, webhookCallback as telegramWebhookCallback } from "grammy";
import { ResultAsync } from "neverthrow";
import * as R from "@remeda/remeda";
import type { Plugin } from "../../types/index.ts";
import type { AppConfig } from "../../services/config.ts";
import type { LLM } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import { APOLOGY, makeSystemPrompt } from "./prompt.ts";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { type AppError, telegramError } from "../../errors.ts";

export const BOT_SENDER_ID = "MechMaidBot";
export const BOT_SENDER_NAME = "Noelle";

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
  // note that for 1:1 chats, the chatId is the same as the senderId and will not change
  // for group chats, the chatId will be the groupId and will not change
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

    // If the message is a /start command, introduce the bot
    // if (messageText === "/start") {
    //   const introMessage =
    //     "Good day. I am Mr. Stevens, at your service. I shall make note of any important matters you wish me to remember and will ensure they're properly attended to at the appropriate time. If I may, I would like to ask you a few questions to understand how I can better serve you and your household.";
    //   await ctx.reply(introMessage);

    //   // Store the bot's response in chat history
    //   await storeChatMessage(
    //     chatId,
    //     BOT_SENDER_ID,
    //     BOT_SENDER_NAME,
    //     introMessage,
    //     true,
    //   );
    //   return;
    // }

    // If it's another command, ignore it
    if (msgCtx.messageText.startsWith("/")) {
      return;
    }

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
        // Retrieve chat history for this chat, which now includes the current message we just stored.
        // by default, we'll get the last 50 messages.
        ResultAsync.combine([
          memory.getAllMemories(),
          messages.getChatHistory({ chatId: msgCtx.chatId }),
        ])
      )
      .andTee(([memories, history]) => {
        console.log("memories:", memories);
        // console.log("chat history:", history);
      })
      .map(([memories, history]) => ({
        systemPrompt: makeSystemPrompt(memory.formatMemoriesForPrompt(memories)),
        llmMessages: R.isEmpty(history) ? [] : messages.mapToLLM(history),
      }))
      .andThen(({ systemPrompt, llmMessages }) =>
        llm.generateText({ messages: llmMessages, systemPrompt })
      )
      .andThen((llmResponse) => {
        const analysisResult = memory.extractMemories(llmResponse);
        return analysisResult.asyncAndThen((analysis) => {
          // don't strip tags if we are debugging
          const response = config.LOG_LEVEL === "debug" ? llmResponse : analysis.response;
          return memory.updateMemories(analysis).map(() => response);
        });
      })
      .andThen((response) =>
        reply(response).andThen(() =>
          messages.storeChatMessage({
            chatId: msgCtx.chatId,
            senderId: BOT_SENDER_ID,
            senderName: BOT_SENDER_NAME,
            message: response,
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
