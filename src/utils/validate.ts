import * as z from "@zod/zod";
import { err, ok, Result } from "neverthrow";

export const toError = (err: unknown): Error => err instanceof Error ? err : new Error(String(err));

export const safeParse = <T>(schema: z.ZodSchema<T>) => (data: unknown): Result<T, z.ZodError> => {
  const result = schema.safeParse(data);
  return result.success ? ok(result.data) : err(result.error);
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

export const extractTag = (tag: string) => (text: string): string | null => {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const match = text.match(regex);
  return match ? match[1] : null;
};

export const stripTag = (tag: string) => (text: string): string =>
  text.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`), "").trim();

export const stripTags = (tags: string[]) => (text: string): string =>
  tags.map(stripTag)
    .reduce((text, strip) => strip(text), text);
