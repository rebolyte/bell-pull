import * as z from "@zod/zod";
import { jsonParsed, safeParse } from "../../utils/validate.ts";

export const MemoryRowSchema = z.object({
  id: z.number(),
  date: z.string().nullable(),
  text: z.string(),
});

export const MemoryModelSchema = MemoryRowSchema.transform((row) => ({
  id: row.id,
  date: row.date ? new Date(row.date) : null,
  text: row.text,
}));

export const CreateMemoryInputSchema = z.object({
  date: z.string().nullable().optional(),
  text: z.string().min(1),
});

export const LLMCreateMemorySchema = z.object({
  date: z.string().nullable().optional(),
  text: z.string(),
});

export const LLMEditMemorySchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  date: z.string().nullable().optional(),
  tags: z.string().optional(),
});

export const LLMDeleteMemoryIdsSchema = z.array(z.string());

export const CreateMemoriesSchema = jsonParsed(z.array(LLMCreateMemorySchema));
export const EditMemoriesSchema = jsonParsed(z.array(LLMEditMemorySchema));
export const DeleteMemoriesSchema = jsonParsed(LLMDeleteMemoryIdsSchema);

export const MemoryAnalysisSchema = z.object({
  memories: z.array(LLMCreateMemorySchema).default([]),
  editMemories: z.array(LLMEditMemorySchema).default([]),
  deleteMemories: LLMDeleteMemoryIdsSchema.default([]),
});

export type MemoryRow = z.infer<typeof MemoryRowSchema>;
export type MemoryModel = z.output<typeof MemoryModelSchema>;
export type CreateMemoryInput = z.input<typeof CreateMemoryInputSchema>;
export type LLMCreateMemory = z.infer<typeof LLMCreateMemorySchema>;
export type LLMEditMemory = z.infer<typeof LLMEditMemorySchema>;
export type MemoryAnalysis = z.infer<typeof MemoryAnalysisSchema>;

export const parseMemoryRow = safeParse(MemoryModelSchema);
export const parseMemoryInput = safeParse(CreateMemoryInputSchema);
export const parseLLMCreateMemories = safeParse(z.array(LLMCreateMemorySchema));
export const parseLLMEditMemories = safeParse(z.array(LLMEditMemorySchema));
export const parseLLMDeleteIds = safeParse(LLMDeleteMemoryIdsSchema);

export const toRowInsert = (
  memory: z.output<typeof CreateMemoryInputSchema>,
): Omit<MemoryRow, "id"> => ({
  date: memory.date ?? null,
  text: memory.text,
});
