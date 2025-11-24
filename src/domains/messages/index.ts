import * as R from "@remeda/remeda";
import type { InsertResult } from "kysely";
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
  Promise<InsertResult>
> = ({ db, logger }) => async ({ chatId, senderId, senderName, message, isBot = false }) => {
  logger.info("Storing chat message...");

  const result = await db.insertInto("messages").values({
    chat_id: chatId,
    sender_id: senderId,
    sender_name: senderName,
    is_bot: isBot ? 1 : 0,
    message,
  }).executeTakeFirst();

  return result;
};

const getChatHistory: Reader<
  "db",
  { chatId: string; limit?: number },
  Promise<unknown[]>
> = ({ db }) => async ({ chatId, limit = 50 }) => {
  const result = await db.selectFrom("messages")
    .selectAll()
    .where("chat_id", "=", chatId)
    .orderBy("created_at", "asc")
    .limit(limit)
    .execute();

  return result;
};

export const makeMessagesDomain = (ctx: Context) => ({
  storeChatMessage: storeChatMessage(ctx),
  getChatHistory: getChatHistory(ctx),
});

export const makeMessagesDomain2 = (ctx: Context) =>
  R.pipe(
    {
      storeChatMessage,
      getChatHistory,
    },
    R.mapValues((readerFn) => readerFn(ctx)),
  );

export type MessagesDomain = ReturnType<typeof makeMessagesDomain>;
