import type { FieldInfo } from "../types/shared.ts";

export const parseFormToConfig = (
  formData: Record<string, string | File>,
  fields: FieldInfo[],
): Record<string, unknown> => {
  const config: Record<string, unknown> = {};

  for (const field of fields) {
    const value = formData[field.key];

    if (field.type === "boolean") {
      config[field.key] = value === "on";
    } else if (field.type === "number") {
      if (value !== undefined && value !== "") {
        config[field.key] = Number(value);
      }
    } else if (value !== undefined && value !== "") {
      config[field.key] = value;
    }
  }

  return config;
};
