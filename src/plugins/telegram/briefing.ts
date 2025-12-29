import { DateTime } from "luxon";
import { errAsync, ResultAsync } from "neverthrow";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import type { Bot } from "grammy";
import { sendAndStoreMessage } from "./lib.ts";
import type { AppConfig } from "../../services/config.ts";
import type { LLMService } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import { backstory, makeBriefingPrompt } from "./prompt.ts";
import { AppError, appError } from "../../errors.ts";
import { Memory } from "../../domains/memory/schema.ts";

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

  // TODO get relevant memories
  return deps.memory
    .getAllMemories()
    .andThen((memories) => generateBriefingContent(deps, memories, finalToday))
    .andThen((content) =>
      sendAndStoreMessage({ api: bot.api, chatId: finalChatId }, content, deps.messages)
    );
};
