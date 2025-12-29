import { Result, ResultAsync } from "neverthrow";
import type { AppConfig } from "../../services/config.ts";
import {
  type CreateMessageInput,
  type Message,
  parseMessage,
  parseMessageInput,
  toInsert,
} from "./schema.ts";
import { dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";
import type { LLMMessageParam } from "../../services/llm.ts";

type MessagesDeps = { config: AppConfig; db: Database; logger: Logger };

const storeChatMessage = ({ db, logger }: MessagesDeps) =>
(
  input: CreateMessageInput,
) => {
  logger.info("Storing chat message...");

  return parseMessageInput(input)
    .asyncAndThen((parsed) =>
      ResultAsync.fromPromise(
        db.insertInto("messages").values(toInsert(parsed)).returningAll()
          .executeTakeFirstOrThrow(),
        dbError("Failed to store message"),
      ).andThen(parseMessage)
    );
};

const getChatHistory =
  ({ db }: MessagesDeps) => ({ chatId, limit = 50 }: { chatId: string; limit?: number }) =>
    ResultAsync.fromPromise(
      db.selectFrom("messages")
        .selectAll()
        .where("chatId", "=", chatId)
        .orderBy("createdAt", "asc")
        .limit(limit)
        .execute(),
      dbError("Failed to get chat history"),
    ).andThen((rows) => Result.combine(rows.map(parseMessage)));

const mapToLLM = (history: Message[]): LLMMessageParam[] =>
  history.map((msg) =>
    msg.isBot
      ? { role: "assistant", content: msg.message }
      : { role: "user", content: `${msg.senderName} says: ${msg.message}` }
  );

export const makeMessagesDomain = (deps: MessagesDeps) => ({
  storeChatMessage: storeChatMessage(deps),
  getChatHistory: getChatHistory(deps),
  mapToLLM,
});

export type MessagesDomain = ReturnType<typeof makeMessagesDomain>;
