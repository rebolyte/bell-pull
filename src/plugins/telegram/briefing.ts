import { DateTime } from "luxon";
import { errAsync, ResultAsync } from "neverthrow";
import * as R from "@remeda/remeda";
import type { Bot } from "grammy";
import type { AppConfig } from "../../services/config.ts";
import type { LLMService } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { backstory, makeBriefingPrompt } from "./prompt.ts";
import { BOT_SENDER_ID, BOT_SENDER_NAME } from "./index.ts";
import { AppError, appError, telegramError } from "../../errors.ts";
import { Memory } from "../../domains/memory/schema.ts";
import { chunkByLines } from "../../utils/string.ts";

type BriefingDeps = {
  config: AppConfig;
  llm: LLMService;
  memory: MemoryDomain;
  messages: MessagesDomain;
};

const weekDayCheatsheet = (today: DateTime): string =>
  Array.from({ length: 7 }, (_, i) => {
    const day = today.plus({ days: i });
    const prefix = i === 0 ? "Today: " : i === 1 ? "Tomorrow: " : "";
    return `* ${prefix}${day.toFormat("EEEE, MMMM d")}`;
  }).join("\n");

const generateBriefingContent = (
  { llm, memory }: BriefingDeps,
  memories: Memory[],
  today: DateTime,
) => {
  const weekdaysHelp = weekDayCheatsheet(today);
  const memoriesString = memory.formatMemoriesForPrompt(memories);
  const briefingPrompt = makeBriefingPrompt(memoriesString, weekdaysHelp);

  return llm.generateText({
    messages: [{ role: "user", content: briefingPrompt }],
    systemPrompt: backstory,
  });
};

const sendTelegramMessage = (
  bot: Bot,
  chatId: string,
  content: string,
  messages: MessagesDomain,
): ResultAsync<string[], AppError> => {
  const MAX_LENGTH = 4000;

  const chunks = chunkByLines(MAX_LENGTH, content);

  return ResultAsync.fromPromise(
    chunks.reduce(async (prevP, chunk) => {
      await prevP;

      const msgResult = await ResultAsync.fromPromise(
        bot.api.sendMessage(chatId, chunk, { parse_mode: "Markdown" }),
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

export const sendDailyBriefing = (
  bot: Bot,
  deps: BriefingDeps,
  chatId?: string,
  today?: DateTime,
): ResultAsync<string[], AppError> => {
  const finalChatId = chatId || deps.config.TELEGRAM_CHAT_ID;
  const finalToday = today || DateTime.now().setZone(deps.config.TIMEZONE).startOf("day");

  if (!finalChatId) {
    return errAsync(appError("validation", "No chat ID provided or configured"));
  }

  return deps.memory
    .getAllMemories()
    .andThen((memories) => generateBriefingContent(deps, memories, finalToday))
    .andThen((content) => sendTelegramMessage(bot, finalChatId, content, deps.messages));
};
