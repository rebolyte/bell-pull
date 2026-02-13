import * as z from "@zod/zod";
import { parseToResult } from "../../utils/validate.ts";

export const CronLogState = { Ok: 0, Error: 1 } as const;

export const CronLogRowSchema = z.object({
  id: z.number(),
  jobName: z.string(),
  state: z.number(),
  result: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string(),
});

export type CronLogRow = z.output<typeof CronLogRowSchema>;
export const parseCronLogRow = parseToResult(CronLogRowSchema);

export const CronLogEntrySchema = z.object({
  jobName: z.string().min(1),
  state: z.number().refine((v) => v === 0 || v === 1),
  result: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  durationMs: z.number().optional(),
});

export type CronLogEntry = z.input<typeof CronLogEntrySchema>;
