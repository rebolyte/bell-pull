import * as z from "@zod/zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

  if (prop.type === "boolean") return "boolean";
  if (prop.type === "number" || prop.type === "integer") return "number";
  if (prop.enum) return "enum";

  return "text";
};

export const extractFieldsFromSchema = (schema: z.ZodTypeAny): FieldInfo[] => {
  const jsonSchema = zodToJsonSchema(schema) as JsonSchema;
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
