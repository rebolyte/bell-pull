import * as z from "@zod/zod";

export const secret = <T extends z.ZodTypeAny>(schema: T): T =>
  schema.describe("field:secret") as T;

export const cron = <T extends z.ZodTypeAny>(schema: T): T => schema.describe("field:cron") as T;

export const managed = <T extends z.ZodTypeAny>(schema: T): T =>
  schema.describe("field:managed") as T;

export const hidden = <T extends z.ZodTypeAny>(schema: T): T =>
  schema.describe("field:hidden") as T;

export type FieldType =
  | "text"
  | "secret"
  | "cron"
  | "number"
  | "boolean"
  | "enum"
  | "managed"
  | "hidden";

export type FieldInfo = {
  key: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
};

type JsonSchemaProperty = {
  type?: string;
  enum?: string[];
  default?: unknown;
  description?: string;
};

type JsonSchema = {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

const getFieldType = (prop: JsonSchemaProperty): FieldType => {
  const desc = prop.description ?? "";

  if (desc.includes("field:secret")) return "secret";
  if (desc.includes("field:cron")) return "cron";
  if (desc.includes("field:managed")) return "managed";
  if (desc.includes("field:hidden")) return "hidden";

  if (prop.type === "boolean") return "boolean";
  if (prop.type === "number" || prop.type === "integer") return "number";
  if (prop.enum) return "enum";

  return "text";
};

export const extractFieldsFromSchema = (schema: z.ZodTypeAny): FieldInfo[] => {
  const jsonSchema = z.toJSONSchema(schema) as JsonSchema;
  if (!jsonSchema.properties) return [];

  const requiredFields = new Set(jsonSchema.required ?? []);

  return Object.entries(jsonSchema.properties).map(([key, prop]) => ({
    key,
    type: getFieldType(prop),
    required: requiredFields.has(key),
    defaultValue: prop.default,
    enumValues: prop.enum,
  }));
};
