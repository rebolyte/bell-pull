import {
  type CommandContext,
  Context,
  Filter,
  webhookCallback as telegramWebhookCallback,
} from "grammy";
import * as z from "@zod/zod";
import { DateTime } from "luxon";
import { ResultAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import type { AppConfig } from "../../services/config.ts";
import { cron } from "../../services/config-schema.ts";
import type { Logger } from "../../services/logger.ts";

const configSchema = z.object({
  "telegram-send-daily-briefing-schedule": cron(z.string().default("0 9 * * *")),
});

type TelegramConfig = z.infer<typeof configSchema>;
import type { LLMService } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import { stripMetricTags } from "../../domains/metrics/index.ts";
import type { MetricsDomain } from "../../domains/metrics/index.ts";
import { makeIntakePrompt, makeSystemPrompt } from "./prompt.ts";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import type { PluginsDomain } from "../../domains/plugins/index.ts";
import { extractContext, handleBotError, makeBot, sendAndStoreMessage } from "./lib.ts";
import { type RetryFn, withRetry } from "../../utils/retry.ts";
import { sendDailyBriefing } from "./briefing.ts";

export type BotDeps = {
  config: AppConfig;
  log: Logger;
  llm: LLMService;
  memory: MemoryDomain;
  metrics: MetricsDomain;
  messages: MessagesDomain;
  plugins: PluginsDomain;
  retry?: RetryFn;
};

export const handleStartCommand = async (
  ctx: CommandContext<Context>,
  { config, log, messages: messagesDomain, retry = withRetry() }: BotDeps,
) => {
  const msgCtx = extractContext(ctx);
  const welcomeMessage =
    "Good day. I am Noelle, at your service. I shall make note of any important matters you wish me to remember and will ensure they are properly attended to at the appropriate time. If I may, I would like to ask you a few questions to understand how I can better serve you and your household.";

  const result = await sendAndStoreMessage({
    msgCtx,
    content: welcomeMessage,
    messagesDomain,
    config,
    retry,
  });

  result.match(
    () => {},
    (error) => handleBotError(error, msgCtx, messagesDomain, log, retry),
  );
};

export const handleHelpCommand = async (
  ctx: CommandContext<Context>,
  { config, log, messages: messagesDomain, retry = withRetry() }: BotDeps,
) => {
  const msgCtx = extractContext(ctx);
  const helpMessage =
    "I am your personal assistant who remembers important information for you. Simply tell me things you would like me to remember, and I will keep them organized for future reference.\n\nAvailable commands:\n/start - Introduction and initial setup\n/help - Show this help message";

  const result = await sendAndStoreMessage({
    msgCtx,
    content: helpMessage,
    messagesDomain,
    config,
    retry,
  });

  result.match(
    () => {},
    (error) => handleBotError(error, msgCtx, messagesDomain, log, retry),
  );
};

export const handleMessage = async (
  ctx: Filter<Context, "message">,
  { config, log, llm, memory, metrics, messages: messagesDomain, plugins, retry = withRetry() }:
    BotDeps,
) => {
  const msgCtx = extractContext(ctx);

  log.info`received: ${msgCtx.messageText.slice(0, 100)}...`;

  if (msgCtx.messageText.startsWith("/")) {
    return;
  }

  const result = await messagesDomain
    .storeChatMessage({
      chatId: msgCtx.chatId,
      senderId: msgCtx.senderId,
      senderName: msgCtx.senderName,
      message: msgCtx.messageText,
      isBot: false,
    })
    .andThen(() =>
      ResultAsync.combine([
        memory.getAllMemories(),
        // Retrieve chat history for this chat, which now includes the current message we just stored.
        // by default, we'll get the last 50 messages
        messagesDomain.getChatHistory({ chatId: msgCtx.chatId }),
      ])
    )
    .andTee(([memories, _history]) => {
      log.debug`memories: ${{ memories }}`;
    })
    .andThen(([memories, history]) => {
      const formattedMemories = memory.formatMemoriesForPrompt(memories);
      const systemPrompt = memories.length < 25
        ? `${makeSystemPrompt(config, formattedMemories)}\n\n${makeIntakePrompt()}`
        : makeSystemPrompt(config, formattedMemories);

      return llm.generateText({
        messages: messagesDomain.mapToLLM(history),
        systemPrompt,
      });
    })
    .andThen((llmResponse) =>
      memory.extractMemories(llmResponse).asyncAndThen((memAnalysis) =>
        metrics.extractMetrics(llmResponse).asyncAndThen((metricAnalysis) => {
          const todayStr = DateTime.now().setZone(config.TIMEZONE).toFormat("yyyy-MM-dd");
          const toRecord = metricAnalysis.toRecord.map((e) => ({
            ...e,
            date: e.date ?? todayStr,
            source: "conversation",
          }));

          return plugins.getConfig("telegram").andThen((telegramConfig) => {
            const pluginConfig = telegramConfig ?? undefined;
            const response = config.LOG_LEVEL === "debug"
              ? llmResponse
              : stripMetricTags(memAnalysis.response);
            return memory.updateMemories(memAnalysis, pluginConfig)
              .andThen(() => metrics.record(toRecord))
              .andThen(() => metrics.deleteMetrics(metricAnalysis.toDelete))
              .map(() => response);
          });
        })
      )
    )
    .andThen((response) =>
      sendAndStoreMessage({ msgCtx, content: response, messagesDomain, config, retry })
    );

  result.match(
    () => {},
    (error) => handleBotError(error, msgCtx, messagesDomain, log, retry),
  );
};

export const telegramPlugin: Plugin<TelegramConfig> = {
  name: "telegram",
  configSchema,
  init: (apps, container) => {
    const bot = makeBot({ config: container.config });

    bot.command("start", (ctx) => handleStartCommand(ctx, container));
    bot.command("help", (ctx) => handleHelpCommand(ctx, container));
    bot.on("message", (ctx) => handleMessage(ctx, container));

    // https://grammy.dev/guide/deployment-types
    apps.public.use("/webhook/telegram", telegramWebhookCallback(bot, "hono"));
  },
  cronJobs: (config) => [{
    name: "telegram-send-daily-briefing",
    schedule: config?.["telegram-send-daily-briefing-schedule"] ?? "0 9 * * *",
    run: (container, _job) => {
      const bot = makeBot({ config: container.config });
      return sendDailyBriefing(bot, container).map((chunks) => ({
        sent: chunks.length,
      }));
    },
  }],
};
