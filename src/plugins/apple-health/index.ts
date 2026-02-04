import * as z from "@zod/zod";
import { DateTime } from "luxon";
import { okAsync } from "neverthrow";
import type { Plugin } from "../../types/index.ts";
import { secret } from "../../services/config-schema.ts";

const NAME = "apple-health";

const configSchema = z.object({
  apiKey: secret(z.string().min(1)),
});

type AppleHealthConfig = z.infer<typeof configSchema>;

const healthDataSchema = z.object({
  date: z.string().optional(),
  steps: z.number().optional(),
  activeEnergy: z.number().optional(),
  exerciseMinutes: z.number().optional(),
  standHours: z.number().optional(),
  heartRate: z.object({
    resting: z.number().optional(),
    average: z.number().optional(),
  }).optional(),
  sleep: z.object({
    hours: z.number().optional(),
    quality: z.string().optional(),
  }).optional(),
  weight: z.number().optional(),
  custom: z.record(z.unknown()).optional(),
});

type HealthData = z.infer<typeof healthDataSchema>;

const formatHealthSummary = (data: HealthData): string => {
  const parts: string[] = [];

  if (data.steps) parts.push(`${data.steps.toLocaleString()} steps`);
  if (data.activeEnergy) parts.push(`${Math.round(data.activeEnergy)} active cal`);
  if (data.exerciseMinutes) parts.push(`${data.exerciseMinutes} min exercise`);
  if (data.standHours) parts.push(`${data.standHours} stand hours`);
  if (data.heartRate?.resting) parts.push(`${data.heartRate.resting} bpm resting HR`);
  if (data.sleep?.hours) parts.push(`${data.sleep.hours}h sleep`);
  if (data.weight) parts.push(`${data.weight} lbs`);

  if (data.custom) {
    for (const [key, value] of Object.entries(data.custom)) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.length > 0 ? `Health: ${parts.join(", ")}` : "Health: no data";
};

export const appleHealthPlugin: Plugin<AppleHealthConfig> = {
  name: NAME,
  displayName: "Apple Health",
  configSchema,
  init: (app, container) => {
    const { log, memory, plugins } = container;

    app.post(`/api/plugins/${NAME}/ingest`, async (c) => {
      const apiKey = c.req.header("x-api-key");

      const configResult = await plugins.getConfig<AppleHealthConfig>(NAME);
      if (configResult.isErr() || !configResult.value) {
        return c.json({ error: "Plugin not configured" }, 500);
      }

      const pluginConfig = configResult.value;
      const expectedKey = pluginConfig.config.apiKey;

      if (!apiKey || apiKey !== expectedKey) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const parseResult = healthDataSchema.safeParse(body);

      if (!parseResult.success) {
        return c.json({ error: "Invalid payload", details: parseResult.error.issues }, 400);
      }

      const data = parseResult.data;
      const date = data.date ?? DateTime.now().toISODate()!;
      const summary = formatHealthSummary(data);

      const result = await memory.updateMemories(
        {
          memories: [{ date, text: summary }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        },
        pluginConfig,
      );

      if (result.isErr()) {
        log.error`[${NAME}] Failed to store health data: ${result.error}`;
        return c.json({ error: "Failed to store data" }, 500);
      }

      log.info`[${NAME}] Stored health data for ${date}`;
      return c.json({ success: true, date, summary });
    });
  },
  settingsUI: () => (
    <div class="custom-section">
      <h3>iOS Shortcut Setup</h3>
      <p>
        POST health data to <code>/api/plugins/apple-health/ingest</code> with header{" "}
        <code>x-api-key</code> set to your API key.
      </p>
      <details>
        <summary>Example payload</summary>
        <pre>{`{
  "date": "2024-01-15",
  "steps": 8500,
  "activeEnergy": 450,
  "exerciseMinutes": 30,
  "standHours": 10,
  "heartRate": { "resting": 58 },
  "sleep": { "hours": 7.5 }
}`}</pre>
      </details>
    </div>
  ),
};
