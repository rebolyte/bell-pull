import * as z from "@zod/zod";
import { parseToResult } from "../../utils/validate.ts";

export const MetricSchema = z.object({
  id: z.number(),
  date: z.string(),
  metric: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
});

export type Metric = z.output<typeof MetricSchema>;
export const parseMetric = parseToResult(MetricSchema);

export const MetricEntrySchema = z.object({
  date: z.string(),
  metric: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  source: z.string(),
});

export type MetricEntry = z.input<typeof MetricEntrySchema>;

export const LLMMetricEntrySchema = z.object({
  date: z.string().optional(),
  metric: z.string(),
  value: z.number(),
  unit: z.string().optional(),
});

export const LLMDeleteMetricSchema = z.object({
  metric: z.string(),
  date: z.string(),
});

export type LLMMetricEntry = z.infer<typeof LLMMetricEntrySchema>;
export type LLMDeleteMetric = z.infer<typeof LLMDeleteMetricSchema>;

export type PeriodStats = {
  avg: number;
  total: number;
  count: number;
};

export type TrendSummary = {
  metric: string;
  unit: string | null;
  current: PeriodStats;
  prior: PeriodStats;
  deltaPercent: number | null;
};
