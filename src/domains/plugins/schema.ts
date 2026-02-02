import * as z from "@zod/zod";
import { parseToResult } from "../../utils/validate.ts";

export const PluginConfigRowSchema = z.object({
  id: z.number(),
  pluginName: z.string(),
  config: z.string(),
  enabled: z.number().transform((v) => v === 1),
  createdAt: z.string(),
  lastModified: z.string(),
});

export type PluginConfigRow = z.output<typeof PluginConfigRowSchema>;

export const parsePluginConfigRow = parseToResult(PluginConfigRowSchema);
