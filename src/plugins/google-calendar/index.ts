import { Google } from "arctic";
import * as z from "@zod/zod";
import { ResultAsync } from "neverthrow";
import type { CronJob, Plugin } from "../../types/index.ts";
import { secret, oauthManaged, cron } from "../../services/config-schema.ts";
import { appError } from "../../errors.ts";

const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: secret(z.string().min(1)),
  calendarId: z.string().default("primary"),
  syncSchedule: cron(z.string().default("0 */6 * * *")),
  // OAuth-managed fields
  accessToken: oauthManaged(z.string().optional()),
  refreshToken: oauthManaged(z.string().optional()),
  tokenExpiresAt: oauthManaged(z.string().optional()),
});

type GoogleCalendarConfig = z.infer<typeof configSchema>;

const fetchCalendarEvents = async (
  config: GoogleCalendarConfig,
  // deno-lint-ignore no-explicit-any
  log: any,
): Promise<{ summary: string; start: string }[]> => {
  if (!config.accessToken) {
    throw new Error("Not authenticated");
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    calendarId: config.calendarId,
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    log.error`Google Calendar API error: ${response.status} ${text}`;
    throw new Error(`Calendar API error: ${response.status}`);
  }

  const data = await response.json();

  return (data.items || []).map((event: { summary?: string; start?: { dateTime?: string; date?: string } }) => ({
    summary: event.summary || "Untitled",
    start: event.start?.dateTime || event.start?.date || "",
  }));
};

export const googleCalendarPlugin: Plugin<GoogleCalendarConfig> = {
  name: "google-calendar",
  displayName: "Google Calendar",
  configSchema,
  oauth: {
    createProvider: (clientId, clientSecret, redirectUri) =>
      new Google(clientId, clientSecret, redirectUri),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  },
  cronJobs: (config) => [
    {
      name: "google-calendar-sync",
      schedule: config.syncSchedule,
      run: (container) =>
        ResultAsync.fromPromise(
          (async () => {
            const events = await fetchCalendarEvents(config, container.log);
            container.log.info`Fetched ${events.length} calendar events`;

            for (const event of events) {
              const memoryText = `Calendar: ${event.summary}`;
              await container.memory.updateMemories({
                memories: [{ date: event.start.split("T")[0], text: memoryText }],
                editMemories: [],
                deleteMemories: [],
                response: "",
              });
            }

            return { synced: events.length };
          })(),
          (e) => appError("calendar", `Sync failed: ${e}`),
        ),
    },
  ],
};
