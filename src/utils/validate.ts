import * as z from "@zod/zod";
import { err, ok, Result } from "neverthrow";
import { type AppError, appError } from "../errors.ts";

export const toError = (e: unknown): Error => e instanceof Error ? e : new Error(String(e));

export const parseToResult =
  <T>(schema: z.ZodSchema<T>) => (data: unknown): Result<T, AppError> => {
    const result = schema.safeParse(data);
    if (result.success) return ok(result.data);
    const msg = result.error.issues[0]?.message ?? "Validation failed";
    return err(appError("validation", msg, result.error));
  };

export const jsonParsed = <T extends z.ZodTypeAny>(schema: T) =>
  z.string().transform((str, ctx) => {
    try {
      return JSON.parse(str);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid JSON" });
      return z.NEVER;
    }
  }).pipe(schema);
