import * as z from "@zod/zod";
import { jsonParsed, parseToResult } from "../../utils/validate.ts";

export const MemorySchema = z.object({
  id: z.number(),
  // new Date(dateOnly) produces UTC midnight; read back with { zone: "utc" } to preserve the original date string
  date: z.string().nullable().transform((v) => (v ? new Date(v) : null)),
  text: z.string(),
  source: z.string().nullable(),
  tags: z.string().nullable().transform((v) => (v ? JSON.parse(v) as string[] : null)),
  createdAt: z.string(),
  lastModified: z.string(),
  sourcePluginId: z.number().nullable(),
});

export const CreateMemoryInputSchema = z.object({
  date: z.string().nullable().optional(),
  text: z.string().min(1),
  source: z.string().nullable().optional(),
  sourcePluginId: z.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export const LLMCreateMemorySchema = z.object({
  date: z.string().nullable().optional(),
  text: z.string(),
});

export const LLMEditMemorySchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  date: z.string().nullable().optional(),
});

export const LLMDeleteMemoryIdsSchema = z.array(z.string());

export const CreateMemoriesSchema = jsonParsed(z.array(LLMCreateMemorySchema));
export const EditMemoriesSchema = jsonParsed(z.array(LLMEditMemorySchema));
export const DeleteMemoriesSchema = jsonParsed(LLMDeleteMemoryIdsSchema);

export type Memory = z.output<typeof MemorySchema>;

export type CategorizedMemories = {
  today: Memory[];
  lastWeek: Memory[];
  nextWeek: Memory[];
  general: Memory[];
};
export type CreateMemoryInput = z.input<typeof CreateMemoryInputSchema>;
export type LLMCreateMemory = z.infer<typeof LLMCreateMemorySchema>;
export type LLMEditMemory = z.infer<typeof LLMEditMemorySchema>;

export const parseMemory = parseToResult(MemorySchema);
export const parseMemoryInput = parseToResult(CreateMemoryInputSchema);

export const toInsert = (memory: z.output<typeof CreateMemoryInputSchema>) => ({
  date: memory.date ?? null,
  text: memory.text,
  source: memory.source ?? null,
  tags: memory.tags ? JSON.stringify(memory.tags) : null,
  sourcePluginId: memory.sourcePluginId ?? null,
});
