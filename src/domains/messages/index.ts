import { Result, ResultAsync } from "neverthrow";
import type { AppConfig } from "../../services/config.ts";
import { CreateMessageInput, parseMessageInput, parseMessageRow, toRowInsert } from "./schema.ts";
import { toError } from "../../utils/validate.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";

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

export const makeMessagesDomain = (deps: MessagesDeps) => ({
  storeChatMessage: storeChatMessage(deps),
  getChatHistory: getChatHistory(deps),
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
