import Anthropic from "@anthropic-ai/sdk";
import { ResultAsync } from "neverthrow";
import { match, P } from "ts-pattern";
import * as R from "@remeda/remeda";
import type { AppConfig } from "./config.ts";
import { type AppError, llmError } from "../errors.ts";

export type LLMMessageParam = Anthropic.MessageParam;

type LlmDeps = {
  config: AppConfig;
  anthropic: Anthropic;
  systemPrompt?: string;
};

type Rates = { input: number; output: number };

// https://platform.claude.com/docs/en/about-claude/pricing
const MODEL_RATES: Record<string, Rates> = {
  "opus-4-5": { input: 5, output: 25 },
  "opus-4-1": { input: 15, output: 75 },
  "opus-4-0": { input: 15, output: 75 },
  "sonnet-4-5": { input: 3, output: 15 },
  "sonnet-4-0": { input: 3, output: 15 },
  "sonnet-3-7": { input: 3, output: 15 },
  "haiku-4-5": { input: 1, output: 5 },
  "haiku-3-5": { input: 0.8, output: 4 },
  "opus-3": { input: 15, output: 75 },
  "haiku-3": { input: 0.25, output: 1.25 },
};

const getRates = (model: string): Rates => {
  for (const [key, rates] of Object.entries(MODEL_RATES)) {
    if (model.includes(key)) return rates;
  }
  return { input: 3, output: 15 }; // default to sonnet pricing
};

export const estimateCost = (
  model: Anthropic.Messages.Model,
  usage: Anthropic.Messages.Usage,
): string => {
  const rates = getRates(model);
  const cost = (usage.input_tokens / 1_000_000 * rates.input) +
    (usage.output_tokens / 1_000_000 * rates.output);
  return `$${cost.toFixed(4)}`;
};

export const generateText = ({ config, anthropic, systemPrompt }: LlmDeps) =>
(
  { messages, systemPrompt: systemPromptOverride }: {
    messages: LLMMessageParam[];
    systemPrompt?: string;
  },
): ResultAsync<string, AppError> =>
  ResultAsync.fromPromise(
    anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: config.ANTHROPIC_MAX_TOKENS,
      thinking: { type: "disabled" },
      temperature: 0.7,
      messages,
      ...(systemPromptOverride || systemPrompt
        ? { system: systemPromptOverride || systemPrompt }
        : {}),
    }),
    llmError("Claude API call failed"),
  ).map((response) => {
    if (response.stop_reason === "refusal") {
      console.warn("LLM refused to generate text", response.content[0]);
      return "I apologize, but I can't do that.";
    }

    console.log("usage:", {
      ...response.usage,
      cost: estimateCost(config.ANTHROPIC_MODEL, response.usage),
    });

    if (R.isEmpty(response.content) && response.usage.input_tokens >= config.ANTHROPIC_MAX_TOKENS) {
      console.warn("LLM input tokens exceeded max", response.usage);
      return "I'm sorry, but this is a lot to take in. Please try again with a shorter message.";
    }

    const content = response.content[0];

    return match(content)
      .with({ type: "text" }, (c) => c.text)
      .with({ type: "thinking" }, (c) => c.thinking)
      .with({ type: "tool_use" }, (c) => `${c.name} ${JSON.stringify(c.input)}`)
      .with({ type: "server_tool_use" }, (c) => `${c.name} ${JSON.stringify(c.input)}`)
      .with({ type: "redacted_thinking" }, (c) => `thinking quietly: ${c.data}`)
      .with(
        { type: "web_search_tool_result", content: P.array() },
        (c) => c.content.map((r) => `${r.title}: ${r.url}`).join("\n"),
      )
      .with(
        { type: "web_search_tool_result", content: { error_code: P.select() } },
        (code) => `Search failed: ${code}`,
      )
      .otherwise(() => {
        console.warn("LLM returned unexpected content", JSON.stringify(response, null, 2));
        return "I'm sorry, but I didn't quite catch your request.";
      });
  });

export const makeLlmService = (
  config: AppConfig,
  opts: { anthropic?: Anthropic; systemPrompt?: string } = {},
) => {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const deps: LlmDeps = {
    config,
    anthropic: opts.anthropic ?? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }),
    systemPrompt: opts.systemPrompt,
  };

  return {
    generateText: generateText(deps),
  };
};

export type LLMService = ReturnType<typeof makeLlmService>;
