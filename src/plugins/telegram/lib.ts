import { ResultAsync } from "neverthrow";
import { type Api, Bot, type CommandContext, type Context, type Filter } from "grammy";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { AppError, appError, telegramError, toAppError } from "../../errors.ts";
import { chunkByLines } from "../../utils/string.ts";
import { withRetry, type RetryFn } from "../../utils/retry.ts";
import { AppConfig } from "../../services/config.ts";
import type { Logger } from "../../services/logger.ts";
import { match } from "ts-pattern";
import { APOLOGY } from "./prompt.ts";

export const BOT_SENDER_ID = "MechMaidBot";
export const BOT_SENDER_NAME = "Noelle";

export const makeBot = ({ config }: { config: AppConfig }) => new Bot(config.TELEGRAM_BOT_TOKEN);

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

export const handleBotError = (
  error: AppError,
  msgCtx: Pick<MessageContext, "api" | "chatId">,
  messagesDomain: MessagesDomain,
  log: Logger,
  retry: RetryFn = withRetry(),
) => {
  log.error("Bot error", { error });

  const errorMessage = match(error.type)
    .with("db", () => "I am having trouble accessing my records at the moment.")
    .with("llm", () => "I am experiencing some difficulty processing your request.")
    .with("telegram", () => "I am unable to deliver my response properly.")
    .with("validation", () => "I seem to have misunderstood something in your message.")
    .with("unexpected", () => "Something quite unexpected has occurred.")
    .exhaustive();

  sendAndStoreMessage({ msgCtx, content: `${APOLOGY} ${errorMessage}`, messagesDomain, retry }).match(
    () => {},
    toAppError("unexpected", "Critical: Failed to send error message to user"),
  );
};

export const sendAndStoreMessage = (
  {
    msgCtx,
    content,
    senderId = BOT_SENDER_ID,
    senderName = BOT_SENDER_NAME,
    messagesDomain,
    config,
    retry = withRetry(),
  }: {
    msgCtx: Pick<MessageContext, "api" | "chatId">;
    content: string;
    senderId?: string;
    senderName?: string;
    messagesDomain: MessagesDomain;
    config?: AppConfig;
    retry?: RetryFn;
  },
): ResultAsync<string[], AppError> => {
  // Telegram has a 4096 character limit per message, so we might need to split it
  const MAX_LENGTH = 4000;

  const chunks = chunkByLines(MAX_LENGTH, content);

  return ResultAsync.fromPromise(
    chunks.reduce(async (prevP, chunk, index) => {
      await prevP;

      const msgResult = await ResultAsync.fromPromise(
        retry(() => msgCtx.api.sendMessage(msgCtx.chatId, chunk, { parse_mode: "Markdown" })),
        telegramError("Failed to send message chunk"),
      );

      if (msgResult.isErr()) {
        throw msgResult.error;
      }

      const dbResult = await messagesDomain.storeChatMessage({
        chatId: msgCtx.chatId,
        senderId,
        senderName,
        message: chunk,
        isBot: true,
      });

      if (dbResult.isErr()) {
        throw dbResult.error;
      }

      if (index < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, config?.RATE_LIMIT_DELAY_MS ?? 500));
      }
    }, Promise.resolve()),
    (e) => e instanceof AppError ? e : appError("telegram", "Failed to send message in chunks", e),
  ).map(() => chunks);
};
