import * as z from "@zod/zod";
import { cron, managed, secret } from "../../services/config-schema.ts";

export const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: secret(z.string().min(1)),
  calendarId: z.string().default("primary"),
  "google-calendar-sync-schedule": cron(z.string().default("0 */6 * * *")),
  // managed by OAuth flow
  accessToken: managed(z.string().optional()),
  refreshToken: managed(z.string().optional()),
  tokenExpiresAt: managed(z.string().optional()),
});

export type GoogleCalendarConfig = z.infer<typeof configSchema>;

export type CalendarEvent = {
  summary: string;
  start: { dateTime?: string; date?: string };
};

export type CalendarResponse = {
  items: CalendarEvent[];
};
