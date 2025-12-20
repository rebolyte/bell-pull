import * as z from "@zod/zod";
import { err, ok, Result } from "neverthrow";

export const toError = (err: unknown): Error => err instanceof Error ? err : new Error(String(err));

export const safeParse = <T>(schema: z.ZodSchema<T>) => (data: unknown): Result<T, z.ZodError> => {
  const result = schema.safeParse(data);
  return result.success ? ok(result.data) : err(result.error);
};
