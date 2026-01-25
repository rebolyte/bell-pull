import { Google } from "arctic";
import * as z from "@zod/zod";
import { ResultAsync } from "neverthrow";
import type { Container, CronJob, Plugin } from "../../types/index.ts";
import { secret, oauthManaged, cron } from "../../services/config-schema.ts";
import { appError } from "../../errors.ts";
import { refreshPluginToken } from "../../services/oauth.ts";

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

const isTokenExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) return true;
  const buffer = 5 * 60 * 1000; // 5 min buffer
  return new Date(expiresAt).getTime() - buffer < Date.now();
};

const getValidToken = async (
  container: Container,
): Promise<string> => {
  const configResult = await container.plugins.getConfig<GoogleCalendarConfig>(
    googleCalendarPlugin.name,
  );

  if (configResult.isErr() || !configResult.value) {
    throw new Error("Plugin not configured");
  }

  let config = configResult.value.config;

  if (isTokenExpired(config.tokenExpiresAt)) {
    container.log.info`Google Calendar token expired, refreshing...`;
    const refreshResult = await refreshPluginToken(googleCalendarPlugin, container);

    if (refreshResult.isErr()) {
      throw new Error(`Token refresh failed: ${refreshResult.error.message}`);
    }

    config = { ...config, accessToken: refreshResult.value.accessToken };
  }

  if (!config.accessToken) {
    throw new Error("Not authenticated");
  }

  return config.accessToken;
};

const fetchCalendarEvents = async (
  accessToken: string,
  calendarId: string,
  // deno-lint-ignore no-explicit-any
  log: any,
): Promise<{ summary: string; start: string }[]> => {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
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
            const accessToken = await getValidToken(container);
            const events = await fetchCalendarEvents(accessToken, config.calendarId, container.log);
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
