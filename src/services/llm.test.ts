import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { estimateCost } from "./llm.ts";
import type Anthropic from "@anthropic-ai/sdk";

const makeUsage = (input: number, output: number) =>
  ({ input_tokens: input, output_tokens: output }) as Anthropic.Messages.Usage;

describe("LLM", () => {
  describe("estimateCost", () => {
    it("calculates sonnet-4-5 correctly", () => {
      // 50K input @ $3/MTok + 2K output @ $15/MTok = $0.15 + $0.03 = $0.18
      expect(estimateCost("claude-sonnet-4-5-20250514", makeUsage(50_000, 2_000))).toBe("$0.1800");
    });

    it("calculates haiku-3-5 correctly", () => {
      // 100K input @ $0.80/MTok + 10K output @ $4/MTok = $0.08 + $0.04 = $0.12
      expect(estimateCost("claude-haiku-3-5-20241022", makeUsage(100_000, 10_000))).toBe("$0.1200");
    });

    it("calculates opus-4-5 correctly", () => {
      // 10K input @ $5/MTok + 4K output @ $25/MTok = $0.05 + $0.10 = $0.15
      expect(estimateCost("claude-opus-4-5-20250514", makeUsage(10_000, 4_000))).toBe("$0.1500");
    });

    it("falls back to sonnet pricing for unknown models", () => {
      // 50K input @ $3/MTok + 2K output @ $15/MTok = $0.18
      expect(estimateCost("claude-unknown-model", makeUsage(50_000, 2_000))).toBe("$0.1800");
    });

    it("shows small haiku costs", () => {
      // 1089 input @ $0.80/MTok + 423 output @ $4/MTok
      expect(estimateCost("claude-haiku-3-5-20241022", makeUsage(1089, 423))).toBe("$0.0026");
    });
  });
});
