import type { Context, Reader } from "../../types/index.ts";

type TelegramChatMessage = {
  chatId: string;
  senderId: string;
  senderName: string;
  message: string;
  isBot: boolean;
};

const storeChatMessage: Reader<
  "config" | "db" | "logger",
  TelegramChatMessage,
  void
> = ({ db, logger }) => ({ chatId, senderId, senderName, message, isBot = false }) => {
  logger.info("Storing chat message...");
  return db.execute({
    sql:
      `INSERT INTO telegram_chats (chat_id, sender_id, sender_name, message, is_bot) VALUES (:chat_id, :sender_id, :sender_name, :message, :is_bot)`,
    args: { chatId, senderId, senderName, message, isBot },
  });
};

/*
async function storeChatMessage_old(
  chatId,
  senderId,
  senderName,
  message,
  isBot = false,
) {
  try {
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    await sqlite.execute({
      sql: `INSERT INTO telegram_chats (chat_id, sender_id, sender_name, message, timestamp, is_bot)
            VALUES (:chat_id, :sender_id, :sender_name, :message, :timestamp, :is_bot)`,
      args: {
        chat_id: chatId,
        sender_id: senderId,
        sender_name: senderName,
        message: message,
        timestamp: timestamp,
        is_bot: isBot ? 1 : 0,
      },
    });
    return true;
  } catch (error) {
    console.error("Error storing chat message:", error);
    return false;
  }
}
*/

async function getChatHistory(chatId, limit = 50) {
  try {
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

    const result = await sqlite.execute({
      sql: `SELECT * FROM telegram_chats
            WHERE chat_id = :chat_id
            ORDER BY timestamp ASC
            LIMIT :limit`,
      args: {
        chat_id: chatId,
        limit: limit,
      },
    });

    return result.rows || [];
  } catch (error) {
    console.error("Error retrieving chat history:", error);
    return [];
  }
}

export const makeMessagesDomain = (ctx: Context) => ({
  storeChatMessage: storeChatMessage(ctx),
  getChatHistory: getChatHistory(ctx),
});

export type MessagesDomain = ReturnType<typeof makeMessagesDomain>;
