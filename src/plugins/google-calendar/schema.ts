import * as z from "@zod/zod";
import { cron, oauthManaged, secret } from "../../services/config-schema.ts";

export const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: secret(z.string().min(1)),
  calendarId: z.string().default("primary"),
  syncSchedule: cron(z.string().default("0 */6 * * *")),
  // OAuth-managed fields
  accessToken: oauthManaged(z.string().optional()),
  refreshToken: oauthManaged(z.string().optional()),
  tokenExpiresAt: oauthManaged(z.string().optional()),
});

export type GoogleCalendarConfig = z.infer<typeof configSchema>;
