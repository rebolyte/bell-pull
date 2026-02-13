import { DateTime } from "luxon";
import { errAsync, ResultAsync } from "neverthrow";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import type { Bot } from "grammy";
import { sendAndStoreMessage } from "./lib.ts";
import type { AppConfig } from "../../services/config.ts";
import type { LLMService } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import type { PluginsDomain } from "../../domains/plugins/index.ts";
import {
  DEFAULT_APOLOGY,
  DEFAULT_BACKSTORY,
  DEFAULT_BRIEFING_PROMPT,
  DEFAULT_INTAKE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  makeBriefingPrompt,
  type TelegramPrompts,
} from "./prompt.ts";
import { AppError, appError } from "../../errors.ts";
import type { CategorizedMemories } from "../../domains/memory/schema.ts";

type BriefingDeps = {
  config: AppConfig;
  llm: LLMService;
  memory: MemoryDomain;
  messages: MessagesDomain;
  plugins: PluginsDomain;
};

type TelegramConfig = {
  backstory?: string;
  systemPrompt?: string;
  intakePrompt?: string;
  briefingPrompt?: string;
  apology?: string;
};

const resolvePrompts = (config?: TelegramConfig): TelegramPrompts => ({
  backstory: config?.backstory ?? DEFAULT_BACKSTORY,
  systemPrompt: config?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  intakePrompt: config?.intakePrompt ?? DEFAULT_INTAKE_PROMPT,
  briefingPrompt: config?.briefingPrompt ?? DEFAULT_BRIEFING_PROMPT,
  apology: config?.apology ?? DEFAULT_APOLOGY,
});

const weekDayCheatsheet = (today: DateTime): string =>
  Array.from({ length: 7 }, (_, i) => {
    const day = today.plus({ days: i });
    const prefix = i === 0 ? "Today: " : i === 1 ? "Tomorrow: " : "";
    return `* ${prefix}${day.toFormat("EEEE, MMMM d")}`;
  }).join("\n");

const generateBriefingContent = (
  { llm, memory }: BriefingDeps,
  prompts: TelegramPrompts,
  memories: CategorizedMemories,
  today: DateTime,
) => {
  const weekdaysHelp = weekDayCheatsheet(today);
  const memoriesString = memory.formatCategorizedMemoriesForPrompt(memories);
  const todayStr = today.toFormat("EEEE, MMMM d");
  const briefingPrompt = makeBriefingPrompt(prompts, memoriesString, weekdaysHelp, todayStr);

  return llm.generateText({
    messages: [{ role: "user", content: briefingPrompt }],
    systemPrompt: prompts.backstory,
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

  return deps.plugins
    .getConfig<TelegramConfig>("telegram")
    .andThen((telegramPluginConfig) => {
      const prompts = resolvePrompts(
        telegramPluginConfig?.config as TelegramConfig | undefined,
      );
      return deps.memory
        .getRelevantMemories(finalToday)
        .andThen((memories) => generateBriefingContent(deps, prompts, memories, finalToday));
    })
    .andThen((content) =>
      sendAndStoreMessage({
        msgCtx: { api: bot.api, chatId: finalChatId },
        content,
        messagesDomain: deps.messages,
        config: deps.config,
      })
    );
};
