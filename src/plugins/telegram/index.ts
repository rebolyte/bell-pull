import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.35.0/mod.ts";
import { DateTime } from "https://esm.sh/luxon@3.4.4";
import Anthropic from "npm:@anthropic-ai/sdk@0.24.3";
import { backstory } from "../backstory.ts";
import { formatMemoriesForPrompt, getRelevantMemories } from "../memoryUtils.ts";

// Initialize the bot
if (!Deno.env.get("TELEGRAM_TOKEN")) {
  throw new Error("TELEGRAM_TOKEN is not set");
}
const bot = new Bot(Deno.env.get("TELEGRAM_TOKEN")!);

// Use part of the TELEGRAM_TOKEN itself as the secret_token
const SECRET_TOKEN = Deno.env.get("TELEGRAM_TOKEN")!.split(":")[1];
const handleUpdate = webhookCallback(
  bot,
  "std/http",
  undefined,
  undefined,
  SECRET_TOKEN,
);

let isEndpointSet = false;

// Special ID for the bot's own messages
export const BOT_SENDER_ID = "mr_stevens_bot";
export const BOT_SENDER_NAME = "Mr. Stevens";

// Set up message handler for the bot
bot.on("message", async (ctx) => {
  try {
    // Get Anthropic API key from environment
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("Anthropic API key is not configured.");
      ctx.reply(
        "I apologize, but I'm not properly configured at the moment. Please inform the household administrator.",
      );
      return;
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // Get message text and user info
    const messageText = ctx.message.text || "";
    const username = ctx.message.from.username || ctx.message.from.first_name || "Sir/Madam";
    const chatId = ctx.chat.id;
    const senderId = ctx.message.from.id.toString();
    const senderName = username; // Using username as the sender name

    console.log({ chatId, username, messageText });

    // Store the incoming message in the chat history
    await storeChatMessage(chatId, senderId, senderName, messageText);

    // If the message is a /start command, introduce Mr. Stevens
    if (messageText === "/start") {
      const introMessage =
        "Good day. I am Mr. Stevens, at your service. I shall make note of any important matters you wish me to remember and will ensure they're properly attended to at the appropriate time. If I may, I would like to ask you a few questions to understand how I can better serve you and your household.";
      await ctx.reply(introMessage);

      // Store the bot's response in chat history
      await storeChatMessage(
        chatId,
        BOT_SENDER_ID,
        BOT_SENDER_NAME,
        introMessage,
        true,
      );
      return;
    }

    // If it's another command, ignore it
    if (messageText.startsWith("/")) {
      return;
    }

    // Retrieve chat history for this chat, which now includes the current message we just stored
    const chatHistory = await getChatHistory(chatId);

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

// No additional commands needed for the butler interface

// Handle webhook requests
export default async function (req: Request): Promise<Response> {
  // Set webhook if it is not set yet
  if (!isEndpointSet) {
    await bot.api.setWebhook(req.url, {
      secret_token: SECRET_TOKEN,
    });
    isEndpointSet = true;
  }

  if (req.method === "POST") {
    return await handleUpdate(req);
  }

  return new Response(
    `<h1>Memory Assistant Bot</h1>
    <p>This bot helps you remember important information.</p>`,
    { status: 200, headers: { "content-type": "text/html" } },
  );
}
