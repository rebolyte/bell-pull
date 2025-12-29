import { ResultAsync } from "neverthrow";
import type { Api, CommandContext, Context, Filter } from "grammy";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { BOT_SENDER_ID, BOT_SENDER_NAME } from "./index.ts";
import { AppError, appError, telegramError } from "../../errors.ts";
import { chunkByLines } from "../../utils/string.ts";

export type MessageContext = {
  api: Api;
  chatId: string;
  senderId: string;
  senderName: string;
  messageText: string;
};

export const extractContext = (
  ctx: Filter<Context, "message"> | CommandContext<Context>,
): MessageContext => ({
  api: ctx.api,
  // note that for 1:1 chats, the chatId is the same as the senderId and will not change
  // for group chats, the chatId will be the groupId and will not change
  chatId: ctx.chat.id.toString(),
  senderId: ctx.message!.from.id.toString(),
  senderName: ctx.message!.from.username || ctx.message!.from.first_name || "Sir/Madam",
  messageText: ctx.message!.text || "",
});

export const sendAndStoreMessage = (
  msgCtx: Pick<MessageContext, "api" | "chatId">,
  content: string,
  messagesDomain: MessagesDomain,
): ResultAsync<string[], AppError> => {
  // Telegram has a 4096 character limit per message, so we might need to split it
  const MAX_LENGTH = 4000;

  const chunks = chunkByLines(MAX_LENGTH, content);

  return ResultAsync.fromPromise(
    chunks.reduce(async (prevP, chunk) => {
      await prevP;

      // Telegram supports Markdown V2, but it's more restrictive than regular Markdown
      const msgResult = await ResultAsync.fromPromise(
        msgCtx.api.sendMessage(msgCtx.chatId, chunk, { parse_mode: "Markdown" }),
        telegramError("Failed to send message chunk"),
      );

      if (msgResult.isErr()) {
        throw msgResult.error;
      }

      const dbResult = await messagesDomain.storeChatMessage({
        chatId: msgCtx.chatId,
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
