import { Google } from "arctic";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Container, OAuthClient, OAuthSetup, Plugin } from "../../types/index.ts";
import { type AppError, appError, pluginError } from "../../errors.ts";
import { refreshPluginToken, registerOAuthRoutes } from "../../services/oauth.ts";
import type { PluginConfig } from "../../domains/plugins/index.ts";
import { configSchema, GoogleCalendarConfig } from "./schema.ts";

const NAME = "google-calendar";

const oauth: OAuthSetup = {
  createClient: (clientId: string, clientSecret: string, redirectUri: string) =>
    new Google(clientId, clientSecret, redirectUri),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  createAuthorizationURL: (
    provider: OAuthClient,
    state: string,
    codeVerifier: string,
    scopes: string[],
  ) => {
    const url = provider.createAuthorizationURL(state, codeVerifier, scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url;
  },
};

const isTokenExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) return true;
  const expiry = DateTime.fromISO(expiresAt);
  return expiry.minus({ minutes: 5 }) < DateTime.now();
};

const getValidToken = (
  container: Container,
  pluginConfig: PluginConfig<GoogleCalendarConfig>,
): ResultAsync<string, AppError> => {
  const { log } = container;
  const { config } = pluginConfig;

  if (!config.accessToken) {
    return errAsync(appError("plugin", "Not authenticated"));
  }

  if (isTokenExpired(config.tokenExpiresAt)) {
    log.info`Google Calendar token expired, refreshing...`;
    return refreshPluginToken(NAME, oauth, container).map((t) => t.accessToken);
  }

  return okAsync(config.accessToken);
};

const fetchCalendarEvents = (
  accessToken: string,
  calendarId: string,
  log: Container["log"],
): ResultAsync<{ summary: string; start: string; end: string }[], AppError> => {
  const now = DateTime.now();
  const params = new URLSearchParams({
    timeMin: now.toISO()!,
    timeMax: now.plus({ weeks: 1 }).toISO()!,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${
    encodeURIComponent(calendarId)
  }/events?${params}`;

  return ResultAsync.fromPromise(
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          log.error`Google Calendar API error: ${response.status} ${text}`;
          throw new Error(`Calendar API error: ${response.status}`);
        }
        return response.json();
      }),
    pluginError("Calendar API error"),
  ).map((
    data: {
      items?: Array<{
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    },
  ) =>
    (data.items ?? []).map((event) => ({
      summary: event.summary ?? "Untitled",
      start: event.start?.dateTime ?? event.start?.date ?? "",
      end: event.end?.dateTime ?? event.end?.date ?? "",
    }))
  );
};

export const googleCalendarPlugin: Plugin<GoogleCalendarConfig> = {
  name: NAME,
  displayName: "Google Calendar",
  configSchema,
  oauth,
  init: (apps, container) => {
    registerOAuthRoutes(apps, NAME, oauth, container);
  },
  cronJobs: (config) => [
    {
      name: "google-calendar-sync",
      schedule: config?.["google-calendar-sync-schedule"] ?? "0 */6 * * *",
      run: (container, job) => {
        const { log, memory, plugins } = container;

        const configRes = plugins.getConfig<GoogleCalendarConfig>(
          googleCalendarPlugin.name,
        ).andThen((pluginConfig) => {
          if (pluginConfig === null) {
            return errAsync(appError("plugin", `[${job.name}] Plugin not configured`));
          }
          return okAsync(pluginConfig);
        });

        return configRes.andThen((pluginConfig) => {
          return getValidToken(container, pluginConfig)
            .andThen((accessToken) =>
              fetchCalendarEvents(
                accessToken,
                config?.calendarId ?? "primary",
                log,
              )
            )
            .andTee((events) => {
              log.info`[${job.name}] Fetched ${events.length} calendar events`;
            })
            .andThen((events) =>
              ResultAsync.combine(
                events.map((event) => {
                  const timeStr = event.start.includes("T")
                    ? `${DateTime.fromISO(event.start).toFormat("h:mm a")} - ${
                      DateTime.fromISO(event.end).toFormat("h:mm a")
                    }`
                    : "all day";
                  return memory.updateMemories(
                    {
                      memories: [{
                        date: event.start.split("T")[0],
                        text: `Calendar: ${event.summary} (${timeStr})`,
                      }],
                      editMemories: [],
                      deleteMemories: [],
                      response: "",
                    },
                    pluginConfig,
                  );
                }),
              ).map(() => ({ synced: events.length }))
            );
        });
      },
    },
  ],
};
