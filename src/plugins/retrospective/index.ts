import * as z from "@zod/zod";
import { DateTime } from "luxon";
import { errAsync, ResultAsync } from "neverthrow";
import type { Bot } from "grammy";
import type { Container, Plugin } from "../../types/index.ts";
import { type AppError, appError } from "../../errors.ts";
import { cron, textarea } from "../../services/config-schema.ts";
import { makeBot, sendAndStoreMessage } from "../telegram/lib.ts";
import { DEFAULT_BACKSTORY } from "../telegram/prompt.ts";
import { DEFAULT_RETRO_PROMPT, makeRetroPrompt } from "./prompt.ts";

const NAME = "retrospective";

const configSchema = z.object({
  "retrospective-weekly-schedule": cron(z.string().default("0 18 * * 0")),
  retroPrompt: textarea(
    z.string().default(DEFAULT_RETRO_PROMPT),
    "Variables: {{trends}}, {{memories}}, {{weekRange}}, {{today}}",
  ),
});

type RetroConfig = z.infer<typeof configSchema>;

export const sendWeeklyRetrospective = (
  bot: Bot,
  container: Container,
  chatId?: string,
  today?: DateTime,
): ResultAsync<string[], AppError> => {
  const { config, log, llm, memory, metrics, messages, plugins } = container;
  const finalChatId = chatId || config.TELEGRAM_CHAT_ID;
  const finalToday = today || DateTime.now().setZone(config.TIMEZONE).startOf("day");

  if (!finalChatId) {
    return errAsync(appError("validation", "No chat ID configured"));
  }

  const from = finalToday.minus({ days: 6 }).toFormat("yyyy-MM-dd");
  const to = finalToday.toFormat("yyyy-MM-dd");
  const priorFrom = finalToday.minus({ days: 13 }).toFormat("yyyy-MM-dd");
  const priorTo = finalToday.minus({ days: 7 }).toFormat("yyyy-MM-dd");
  const weekRange = `${from} to ${to}`;

  return ResultAsync.combine([
    metrics.trends({ from, to, priorFrom, priorTo }),
    memory.getRelevantMemories(finalToday),
    plugins.getConfig<RetroConfig>(NAME),
    plugins.getConfig("telegram"),
  ])
    .andThen(([trendData, categorized, retroPluginConfig, telegramConfig]) => {
      const retroPromptTemplate =
        (retroPluginConfig?.config as RetroConfig | undefined)?.retroPrompt ?? DEFAULT_RETRO_PROMPT;
      const backstory =
        (telegramConfig?.config as { backstory?: string } | undefined)?.backstory ??
          DEFAULT_BACKSTORY;
      const trendsString = metrics.formatTrendsForPrompt(trendData);
      const weekMemories = [...categorized.today, ...categorized.lastWeek];
      const memoriesLines = weekMemories.length > 0
        ? weekMemories.map((m) => `- ${m.text}`).join("\n")
        : "No notable memories this week.";
      const retroPrompt = makeRetroPrompt(retroPromptTemplate, trendsString, memoriesLines, weekRange, to);

      return llm.generateText({
        messages: [{ role: "user", content: retroPrompt }],
        systemPrompt: backstory,
      });
    })
    .andThen((content) => {
      log.info`[${NAME}] Generated weekly retrospective`;

      return memory
        .updateMemories({
          memories: [{ date: to, text: `Weekly review: ${content.slice(0, 200)}...` }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        })
        .andThen(() =>
          sendAndStoreMessage({
            msgCtx: { api: bot.api, chatId: finalChatId },
            content,
            messagesDomain: messages,
            config,
          })
        );
    });
};

export const retrospectivePlugin: Plugin<RetroConfig> = {
  name: NAME,
  displayName: "Weekly Retrospective",
  configSchema,
  cronJobs: (config) => [
    {
      name: "retrospective-weekly",
      schedule: config?.["retrospective-weekly-schedule"] ?? "0 18 * * 0",
      run: (container, _job) => {
        const bot = makeBot({ config: container.config });
        return sendWeeklyRetrospective(bot, container).map((chunks) => ({
          sent: chunks.length,
        }));
      },
    },
  ],
};
