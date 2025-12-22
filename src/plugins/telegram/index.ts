import { Bot, webhookCallback as telegramWebhookCallback } from "grammy";
import { ok, ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { AppConfig } from "../../services/config.ts";
import type { LLM, LLMMessageParam } from "../../services/llm.ts";
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

  bot.on("message", async (ctx) => {
    try {
      const messageText = ctx.message.text || "";
      const username = ctx.message.from.username || ctx.message.from.first_name ||
        "Sir/Madam";
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

      // Retrieve chat history for this chat, which now includes the current message we just stored
      const chatHistory = await messages.getChatHistory({ chatId })
        .andTee((history) => {
          console.log("chat history:", history);
        })
        .map((history): LLMMessageParam[] => history.length > 0 ? messages.mapToLLM(history) : [])
        .andThen((formattedHistory) =>
          llm.generateText({
            messages: formattedHistory,
            systemPrompt:
              "You are a helpful assistant tasked with giving me a summary of what we've discussed approximately every 5 messages.",
          }).andThen((response) =>
            ResultAsync.fromPromise(ctx.reply(response), toError).map(() => response)
          )
        );

      if (chatHistory.isErr()) {
        console.error("Error processing message:", chatHistory.error);
        await ctx.reply(
          "I do apologize, but I seem to be experiencing some difficulty at the moment. Perhaps we could try again shortly.",
        );

        return;
      }

      await messages.storeChatMessage({
        chatId,
        senderId: BOT_SENDER_ID,
        senderName: BOT_SENDER_NAME,
        message: chatHistory.value,
        isBot: true,
      });

      return;

      // const memories = await memory.getAllMemories();
      // // TODO - NO!
      // const memoriesString = memory.formatMemoriesForPrompt(memories._unsafeUnwrap());
      // const systemPrompt = makeSystemPrompt(memoriesString);

      // Analyze message content with chat history context
      const analysis = await analyzeMessageContent(
        anthropic,
        username,
        messageText,
        chatHistory,
      );

      // Create memories based on the analysis
      if (analysis.memories && analysis.memories.length > 0) {
        const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");
        const { nanoid } = await import("https://esm.sh/nanoid@5.0.5");

        const createdIds = [];

        for (const memory of analysis.memories) {
          const memoryId = nanoid(10);
          createdIds.push(memoryId);
          await sqlite.execute({
            sql: `INSERT INTO memories (id, date, text, createdBy, createdDate, tags)
                VALUES (:id, :date, :text, :createdBy, :createdDate, :tags)`,
            args: {
              id: memoryId,
              date: memory.date,
              text: memory.text,
              createdBy: "telegram",
              createdDate: Date.now(),
              tags: "",
            },
          });
        }

        console.log(
          `Created ${analysis.memories.length} memories with IDs: ${createdIds.join(", ")}`,
        );
      }

      // Edit memories if requested
      if (analysis.editMemories && analysis.editMemories.length > 0) {
        const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

        const editedIds = [];

        for (const memory of analysis.editMemories) {
          if (!memory.id) {
            console.error("Cannot edit memory without ID:", memory);
            continue;
          }

          editedIds.push(memory.id);

          // Create the SET clause dynamically based on what fields are provided
          const updateFields = [];
          const args: Record<string, any> = { id: memory.id };

          if (memory.text !== undefined) {
            updateFields.push("text = :text");
            args.text = memory.text;
          }

          if (memory.date !== undefined) {
            updateFields.push("date = :date");
            args.date = memory.date;
          }

          if (memory.tags !== undefined) {
            updateFields.push("tags = :tags");
            args.tags = memory.tags;
          }

          // Only proceed if we have fields to update
          if (updateFields.length > 0) {
            const setClause = updateFields.join(", ");
            await sqlite.execute({
              sql: `UPDATE memories SET ${setClause} WHERE id = :id`,
              args,
            });
          }
        }

        console.log(
          `Edited ${editedIds.length} memories with IDs: ${editedIds.join(", ")}`,
        );
      }

      // Delete memories if requested
      if (analysis.deleteMemories && analysis.deleteMemories.length > 0) {
        const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

        for (const memoryId of analysis.deleteMemories) {
          await sqlite.execute({
            sql: `DELETE FROM memories WHERE id = :id`,
            args: { id: memoryId },
          });
        }

        console.log(
          `Deleted ${analysis.deleteMemories.length} memories with IDs: ${
            analysis.deleteMemories.join(", ")
          }`,
        );
      }

      // Respond with the butler-like response
      await ctx.reply(analysis.response);

      // Store the bot's response in chat history (without debug info to keep it clean)
      await storeChatMessage(
        chatId,
        BOT_SENDER_ID,
        BOT_SENDER_NAME,
        analysis.response,
        true,
      );
    } catch (error) {
      console.error("Error processing message:", error);
      await ctx.reply(
        "I do apologize, but I seem to be experiencing some difficulty at the moment. Perhaps we could try again shortly.",
      );
    }
  });

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
