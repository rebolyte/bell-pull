import { Bot, Context, Filter, webhookCallback as telegramWebhookCallback } from "grammy";
import { ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { AppConfig } from "../../services/config.ts";
import type { LLM } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import { makeSystemPrompt } from "./prompt.ts";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { toError } from "../../utils/validate.ts";

// Special ID for the bot's own messages
export const BOT_SENDER_ID = "MechMaidBot";
export const BOT_SENDER_NAME = "Noelle";

type BotDeps = {
  config: AppConfig;
  llm: LLM;
  memory: MemoryDomain;
  messages: MessagesDomain;
};

export const makeBot = (
  { config, llm, memory, messages }: BotDeps,
) => {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  const handleMessage = async (ctx: Filter<Context, "message">) => {
    try {
      const messageText = ctx.message.text || "";
      const username = ctx.message.from.username || ctx.message.from.first_name ||
        "Sir/Madam";
      // note that for 1:1 chats, the chatId is the same as the senderId and will not change
      // for group chats, the chatId will be the groupId and will not change
      const chatId = ctx.chat.id.toString();
      const senderId = ctx.message.from.id.toString();
      const senderName = username;

      console.log("received:", messageText.slice(0, 100) + "...");
      console.log({ chatId, username, messageText });

      const storeResult = await messages.storeChatMessage({
        chatId,
        senderId,
        senderName,
        message: messageText,
        isBot: false,
      });

      if (storeResult.isErr()) {
        console.error("Error storing message:", storeResult.error);
        await ctx.reply(
          "I do apologize, but I seem to be experiencing some difficulty at the moment. Perhaps we could try again shortly.",
        );
        return;
      }

      // If the message is a /start command, introduce Mr. Stevens
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
      if (messageText.startsWith("/")) {
        return;
      }

      const memories = await memory.getAllMemories();
      // TODO - NO!
      const memoriesString = memory.formatMemoriesForPrompt(memories._unsafeUnwrap());
      const systemPrompt = makeSystemPrompt(memoriesString);

      console.log("systemPrompt:", systemPrompt);

      // Retrieve chat history for this chat, which now includes the current message we just stored.
      // by default, we'll get the last 50 messages
      const llmResponse = await messages.getChatHistory({ chatId })
        // .andTee((history) => {
        //   console.log("chat history:", history);
        // })
        .map((history) => history.length > 0 ? messages.mapToLLM(history) : [])
        .andThen((formattedHistory) =>
          llm.generateText({
            messages: formattedHistory,
            systemPrompt,
          }).andThen((responseText) => {
            const analysis = memory.extractMemories(responseText);
            // TODO
            memory.updateMemories(analysis._unsafeUnwrap());
            return ResultAsync.fromPromise(ctx.reply(responseText), toError).map(() =>
              responseText
            );
          })
        );

      if (llmResponse.isErr()) {
        console.error("Error processing message:", llmResponse.error);
        await ctx.reply(
          "I do apologize, but I seem to be experiencing some difficulty at the moment. Perhaps we could try again shortly.",
        );
        return;
      }

      await messages.storeChatMessage({
        chatId,
        senderId: BOT_SENDER_ID,
        senderName: BOT_SENDER_NAME,
        message: llmResponse.value,
        isBot: true,
      });
    } catch (error) {
      console.error("Error processing message:", error);
      await ctx.reply(
        "I do apologize, but I seem to be experiencing some difficulty at the moment. Perhaps we could try again shortly.",
      );
    }
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
