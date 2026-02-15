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

type CalendarDateTime = { dateTime?: string; date?: string; timeZone?: string };

export type CalendarEvent = {
  kind?: string;
  etag?: string;
  id?: string;
  status?: string;
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary: string;
  description?: string;
  location?: string;
  creator?: { email?: string; self?: boolean };
  organizer?: { email?: string; self?: boolean };
  start: CalendarDateTime;
  end?: CalendarDateTime;
  iCalUID?: string;
  sequence?: number;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method?: string; minutes?: number }>;
  };
  eventType?: string;
};

export type CalendarResponse = {
  items: CalendarEvent[];
};
