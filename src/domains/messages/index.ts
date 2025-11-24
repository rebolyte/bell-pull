import * as R from "@remeda/remeda";
import type { InsertResult } from "kysely";
import { ResultAsync } from "neverthrow";
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
  ResultAsync<InsertResult, Error>
> = ({ db, logger }) => (args) => {
  const { chatId, senderId, senderName, message, isBot = false } = args;
  logger.info("Storing chat message...");

  return ResultAsync.fromPromise(
    db.insertInto("messages").values({
      chat_id: chatId,
      sender_id: senderId,
      sender_name: senderName,
      is_bot: isBot ? 1 : 0,
      message,
    }).executeTakeFirst(),
    (e) => e instanceof Error ? e : new Error(String(e)),
  );
};

const getChatHistory: Reader<
  "db",
  { chatId: string; limit?: number },
  ResultAsync<unknown[], Error>
> = ({ db }) => ({ chatId, limit = 50 }) => {
  return ResultAsync.fromPromise(
    db.selectFrom("messages")
      .selectAll()
      .where("chat_id", "=", chatId)
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute(),
    (e) => e instanceof Error ? e : new Error(String(e)),
  );
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
    R.mapValues((f) => f(ctx)),
  );

export type MessagesDomain = ReturnType<typeof makeMessagesDomain>;
