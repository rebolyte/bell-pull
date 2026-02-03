import { Google } from "arctic";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Container, Plugin } from "../../types/index.ts";
import { type AppError, appError, pluginError } from "../../errors.ts";
import { refreshPluginToken } from "../../services/oauth.ts";
import type { PluginConfig } from "../../domains/plugins/index.ts";
import { configSchema, GoogleCalendarConfig } from "./schema.ts";

const isTokenExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) return true;
  const buffer = 5 * 60 * 1000; // 5 min buffer
  return new Date(expiresAt).getTime() - buffer < Date.now();
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
    return refreshPluginToken(googleCalendarPlugin, container).map((t) => t.accessToken);
  }

  return okAsync(config.accessToken);
};

const fetchCalendarEvents = (
  accessToken: string,
  calendarId: string,
  log: Container["log"],
): ResultAsync<{ summary: string; start: string }[], AppError> => {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
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
    data: { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> },
  ) =>
    (data.items ?? []).map((event) => ({
      summary: event.summary ?? "Untitled",
      start: event.start?.dateTime ?? event.start?.date ?? "",
    }))
  );
};

export const googleCalendarPlugin: Plugin<GoogleCalendarConfig> = {
  name: "google-calendar",
  displayName: "Google Calendar",
  configSchema,
  oauth: {
    createProvider: (clientId, clientSecret, redirectUri) =>
      new Google(clientId, clientSecret, redirectUri),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    createAuthorizationURL: (provider, state, codeVerifier, scopes) => {
      const url = provider.createAuthorizationURL(state, codeVerifier, scopes);
      // Google requires access_type=offline to return refresh token
      url.searchParams.set("access_type", "offline");
      // Force consent to get refresh token even if previously authorized
      url.searchParams.set("prompt", "consent");
      return url;
    },
  },
  cronJobs: (config) => [
    {
      name: "google-calendar-sync",
      schedule: config?.syncSchedule ?? "0 */6 * * *",
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
                events.map((event) =>
                  memory.updateMemories(
                    {
                      memories: [{
                        date: event.start.split("T")[0],
                        text: `Calendar: ${event.summary}`,
                      }],
                      editMemories: [],
                      deleteMemories: [],
                      response: "",
                    },
                    pluginConfig,
                  )
                ),
              ).map(() => ({ synced: events.length }))
            );
        });
      },
    },
  ],
};
