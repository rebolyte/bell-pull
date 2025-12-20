import * as z from "@zod/zod";
import { safeParse } from "../../utils/validate.ts";

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

export type MemoryRow = z.infer<typeof MemoryRowSchema>;
export type MemoryModel = z.output<typeof MemoryModelSchema>;
export type CreateMemoryInput = z.input<typeof CreateMemoryInputSchema>;

export const parseMemoryRow = safeParse(MemoryModelSchema);
export const parseMemoryInput = safeParse(CreateMemoryInputSchema);

export const toRowInsert = (
  memory: z.output<typeof CreateMemoryInputSchema>,
): Omit<MemoryRow, "id"> => ({
  date: memory.date ?? null,
  text: memory.text,
});
