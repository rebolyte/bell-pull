import { Result, ResultAsync } from "neverthrow";
import type { AppConfig } from "../../services/config.ts";
import {
  CreateMessageInput,
  MessageModel,
  parseMessageInput,
  parseMessageRow,
  toRowInsert,
} from "./schema.ts";
import { toError } from "../../utils/validate.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";
import { LLMMessageParam } from "../../services/llm.ts";

type MessagesDeps = { config: AppConfig; db: Database; logger: Logger };

const storeChatMessage = ({ db, logger }: MessagesDeps) =>
(
  input: CreateMessageInput,
) => {
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

const getChatHistory =
  ({ db }: MessagesDeps) => ({ chatId, limit = 50 }: { chatId: string; limit?: number }) =>
    ResultAsync.fromPromise(
      db.selectFrom("messages")
        .selectAll()
        .where("chat_id", "=", chatId)
        .orderBy("created_at", "asc")
        .limit(limit)
        .execute(),
      toError,
    ).andThen((rows) => Result.combine(rows.map(parseMessageRow)));

const mapToLLM = (history: MessageModel[]) => {
  const messages: LLMMessageParam[] = [];

  for (const msg of history) {
    if (msg.isBot) {
      messages.push({
        role: "assistant",
        content: msg.message,
      });
    } else {
      // Format user message with sender name
      messages.push({
        role: "user",
        content: `${msg.senderName} says: ${msg.message}`,
      });
    }
  }

  return messages;
};

export const makeMessagesDomain = (deps: MessagesDeps) => ({
  storeChatMessage: storeChatMessage(deps),
  getChatHistory: getChatHistory(deps),
  mapToLLM,
});

// export const makeMessagesDomain2 = (deps: MessagesDeps) =>
//   R.pipe(
//     {
//       storeChatMessage,
//       getChatHistory,
//     },
//     R.mapValues((f) => f(deps)),
//   );

export type MessagesDomain = ReturnType<typeof makeMessagesDomain>;
