import { ResultAsync } from "neverthrow";
import type { Api } from "grammy";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { BOT_SENDER_ID, BOT_SENDER_NAME } from "./index.ts";
import { AppError, appError, telegramError } from "../../errors.ts";
import { chunkByLines } from "../../utils/string.ts";

export const sendAndStoreMessage = (
  botApi: Api,
  chatId: string,
  content: string,
  messages: MessagesDomain,
): ResultAsync<string[], AppError> => {
  // Telegram has a 4096 character limit per message, so we might need to split it
  const MAX_LENGTH = 4000;

  const chunks = chunkByLines(MAX_LENGTH, content);

  return ResultAsync.fromPromise(
    chunks.reduce(async (prevP, chunk) => {
      await prevP;

      // Telegram supports Markdown V2, but it's more restrictive than regular Markdown
      const msgResult = await ResultAsync.fromPromise(
        botApi.sendMessage(chatId, chunk, { parse_mode: "Markdown" }),
        telegramError("Failed to send message chunk"),
      );

      if (msgResult.isErr()) {
        throw msgResult.error;
      }

      const dbResult = await messages.storeChatMessage({
        chatId,
        senderId: BOT_SENDER_ID,
        senderName: BOT_SENDER_NAME,
        message: chunk,
        isBot: true,
      });

      if (dbResult.isErr()) {
        throw dbResult.error;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }, Promise.resolve()),
    (e) => e instanceof AppError ? e : appError("telegram", "Failed to send message in chunks", e),
  ).map(() => chunks);
};
