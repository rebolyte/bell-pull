import * as z from "@zod/zod";

export const secret = <T extends z.ZodTypeAny>(schema: T): T =>
  schema.describe("field:secret") as T;

export const cron = <T extends z.ZodTypeAny>(schema: T): T => schema.describe("field:cron") as T;

export const managed = <T extends z.ZodTypeAny>(schema: T): T =>
  schema.describe("field:managed") as T;

export type FieldType =
  | "text"
  | "secret"
  | "cron"
  | "number"
  | "boolean"
  | "enum"
  | "managed";

export const getFieldType = (schema: z.ZodTypeAny): FieldType => {
  const desc = schema.description ?? "";

  if (desc.includes("field:secret")) return "secret";
  if (desc.includes("field:cron")) return "cron";
  if (desc.includes("field:managed")) return "managed";

  const unwrapped = unwrapSchema(schema);

  if (unwrapped instanceof z.ZodBoolean) return "boolean";
  if (unwrapped instanceof z.ZodNumber) return "number";
  if (unwrapped instanceof z.ZodEnum) return "enum";

  return "text";
};

export const getEnumValues = (schema: z.ZodTypeAny): string[] | null => {
  const unwrapped = unwrapSchema(schema);
  if (unwrapped instanceof z.ZodEnum) {
    return unwrapped.options as string[];
  }
  return null;
};

export const getDefaultValue = (schema: z.ZodTypeAny): unknown => {
  if (schema instanceof z.ZodDefault) {
    return schema._def.defaultValue;
  }
  return undefined;
};

const unwrapSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapSchema(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodPipe) {
    return unwrapSchema(schema._def.in as z.ZodTypeAny);
  }
  return schema;
};

export type FieldInfo = {
  key: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
};

export const extractFieldsFromSchema = (schema: z.ZodTypeAny): FieldInfo[] => {
  if (!(schema instanceof z.ZodObject)) return [];

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  return Object.entries(shape).map(([key, fieldSchema]) => {
    const fieldType = getFieldType(fieldSchema);
    const isOptional = fieldSchema instanceof z.ZodOptional ||
      fieldSchema instanceof z.ZodDefault;

    return {
      key,
      type: fieldType,
      required: !isOptional,
      defaultValue: getDefaultValue(fieldSchema),
      enumValues: getEnumValues(fieldSchema) ?? undefined,
    };
  });
};

