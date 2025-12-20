import * as R from "@remeda/remeda";
import { Result, ResultAsync } from "neverthrow";
import type { Context, Reader } from "../../types/index.ts";
import {
  CreateMessageInput,
  MessageModel,
  parseMessageInput,
  parseMessageRow,
  toRowInsert,
} from "./schema.ts";
import { toError } from "../../utils/validate.ts";

const storeChatMessage: Reader<
  "config" | "db" | "logger",
  CreateMessageInput,
  ResultAsync<MessageModel, Error>
> = ({ db, logger }) => (input) => {
  logger.info("Storing chat message...");

  return parseMessageInput(input)
    .asyncAndThen((input) =>
      ResultAsync.fromPromise(
        db.insertInto("messages").values(toRowInsert(input)).returningAll()
          .executeTakeFirstOrThrow(),
        toError,
      ).andThen(parseMessageRow)
    );
};

const getChatHistory: Reader<
  "db",
  { chatId: string; limit?: number },
  ResultAsync<MessageModel[], Error>
> = ({ db }) => ({ chatId, limit = 50 }) => {
  return ResultAsync.fromPromise(
    db.selectFrom("messages")
      .selectAll()
      .where("chat_id", "=", chatId)
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute(),
    toError,
  ).andThen((rows) => Result.combine(rows.map(parseMessageRow)));
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
