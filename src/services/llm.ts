import Anthropic from "@anthropic-ai/sdk";
import type { AppConfig } from "./config.ts";

export type LLMMessageParam = Anthropic.MessageParam;

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

export const makeLlm = (
  config: AppConfig,
  opts: { anthropic?: Anthropic; systemPrompt?: string } = {},
) => {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const anthropic = opts.anthropic ?? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  return {
    generateText: async (
      { messages, systemPrompt: systemPromptOverride }: {
        messages: LLMMessageParam[];
        systemPrompt?: string;
      },
    ): Promise<string> => {
      const response = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 4196,
        thinking: {
          type: "disabled",
        },
        temperature: 0.7,
        messages,
        ...(systemPromptOverride || opts.systemPrompt
          ? { system: systemPromptOverride || opts.systemPrompt }
          : {}),
      });

      if (response.stop_reason === "refusal") {
        console.warn("LLM refused to generate text", response.content[0]);
        return "I apologize, but I can't do that.";
      }

      console.log("usage:", response.usage, estimateCost(config.ANTHROPIC_MODEL, response.usage));

      const content = response.content[0];

      switch (content.type) {
        case "text":
          return content.text;
        case "thinking":
          return content.thinking;
        case "tool_use":
        case "server_tool_use":
          return content.name + " " + content.input;
        case "redacted_thinking":
          return "thinking quietly: " + content.data;
        case "web_search_tool_result":
          if (Array.isArray(content.content)) {
            return content.content.map((c) => c.title + " - " + c.url).join("\n");
          } else {
            return "I'm sorry, but I've failed you: " + content.content.error_code;
          }
        default:
          console.warn("LLM returned unexpected content", response.content[0]);
          return "I'm sorry, but I didn't quite catch your request.";
      }
    },
  };
};

export type LLM = ReturnType<typeof makeLlm>;
