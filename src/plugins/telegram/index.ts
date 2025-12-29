import {
  Bot,
  type CommandContext,
  Context,
  Filter,
  webhookCallback as telegramWebhookCallback,
} from "grammy";
import { ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import type { Plugin } from "../../types/index.ts";
import type { AppConfig } from "../../services/config.ts";
import type { LLMService } from "../../services/llm.ts";
import type { MemoryDomain } from "../../domains/memory/index.ts";
import { APOLOGY, makeIntakePrompt, makeSystemPrompt } from "./prompt.ts";
import type { MessagesDomain } from "../../domains/messages/index.ts";
import { type AppError, toAppError } from "../../errors.ts";
import { extractContext, type MessageContext, sendAndStoreMessage } from "./lib.ts";
import { sendDailyBriefing } from "./briefing.ts";

export const BOT_SENDER_ID = "MechMaidBot";
export const BOT_SENDER_NAME = "Noelle";

type BotDeps = {
  config: AppConfig;
  llm: LLMService;
  memory: MemoryDomain;
  messages: MessagesDomain;
};

const handleBotError = (
  error: AppError,
  msgCtx: Pick<MessageContext, "api" | "chatId">,
  messagesDomain: MessagesDomain,
) => {
  console.error(`[${error.type}] ${error.message}`, error.cause);

  const errorMessage = match(error.type)
    .with("db", () => "I am having trouble accessing my records at the moment.")
    .with("llm", () => "I am experiencing some difficulty processing your request.")
    .with("telegram", () => "I am unable to deliver my response properly.")
    .with("validation", () => "I seem to have misunderstood something in your message.")
    .with("unexpected", () => "Something quite unexpected has occurred.")
    .exhaustive();

  sendAndStoreMessage(msgCtx, `${APOLOGY} ${errorMessage}`, messagesDomain).match(
    () => {},
    toAppError("unexpected", "Critical: Failed to send error message to user"),
  );
};

export const makeBot = ({ config }: { config: AppConfig }) => {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return new Bot(config.TELEGRAM_BOT_TOKEN);
};

const handleStartCommand = async (
  ctx: CommandContext<Context>,
  { messages: messagesDomain }: BotDeps,
) => {
  const msgCtx = extractContext(ctx);
  const welcomeMessage =
    "Good day. I am Noelle, at your service. I shall make note of any important matters you wish me to remember and will ensure they are properly attended to at the appropriate time. If I may, I would like to ask you a few questions to understand how I can better serve you and your household.";

  const result = await sendAndStoreMessage(msgCtx, welcomeMessage, messagesDomain);

  result.match(
    () => {},
    (error) => handleBotError(error, msgCtx, messagesDomain),
  );
};

const handleHelpCommand = async (
  ctx: CommandContext<Context>,
  { messages: messagesDomain }: BotDeps,
) => {
  const msgCtx = extractContext(ctx);
  const helpMessage =
    "I am your personal assistant who remembers important information for you. Simply tell me things you would like me to remember, and I will keep them organized for future reference.\n\nAvailable commands:\n/start - Introduction and initial setup\n/help - Show this help message";

  const result = await sendAndStoreMessage(msgCtx, helpMessage, messagesDomain);

  result.match(
    () => {},
    (error) => handleBotError(error, msgCtx, messagesDomain),
  );
};

const handleMessage = async (
  ctx: Filter<Context, "message">,
  { config, llm, memory, messages: messagesDomain }: BotDeps,
) => {
  const msgCtx = extractContext(ctx);

  console.log("received:", msgCtx.messageText.slice(0, 100) + "...");

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
        messagesDomain.getChatHistory({ chatId: msgCtx.chatId }),
      ])
    )
    .andTee(([memories, _history]) => {
      console.log("memories:", memories);
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
      // extractMemories returns a Result; we convert to Async to keep chain consistent
      memory.extractMemories(llmResponse).asyncAndThen((analysis) => {
        // don't strip tags if we are debugging
        const response = config.LOG_LEVEL === "debug" ? llmResponse : analysis.response;
        return memory.updateMemories(analysis).map(() => response);
      })
    )
    .andThen((response) => sendAndStoreMessage(msgCtx, response, messagesDomain));

  result.match(
    () => {},
    (error) => handleBotError(error, msgCtx, messagesDomain),
  );
};

export const telegramPlugin: Plugin = {
  name: "telegram",
  init: (app, container) => {
    const bot = makeBot({ config: container.config });

    bot.command("start", (ctx) => handleStartCommand(ctx, container));
    bot.command("help", (ctx) => handleHelpCommand(ctx, container));
    bot.on("message", (ctx) => handleMessage(ctx, container));

    // https://grammy.dev/guide/deployment-types
    app.use("/webhook/telegram", telegramWebhookCallback(bot, "hono"));
  },
  cronJobs: [{
    name: "telegram-send-daily-briefing",
    schedule: "0 9 * * *",
    run: (container) => {
      const bot = makeBot({ config: container.config });
      return sendDailyBriefing(bot, container);
    },
  }],
};
