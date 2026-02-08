import { OAuth2Client } from "arctic";
import { DateTime } from "luxon";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { Container, OAuthClient, OAuthSetup, Plugin } from "../../types/index.ts";
import { type AppError, appError, pluginError } from "../../errors.ts";
import { refreshPluginToken, registerOAuthRoutes } from "../../services/oauth.ts";
import type { PluginConfig } from "../../domains/plugins/index.ts";
import {
  configSchema,
  type TickTickConfig,
  type TickTickProject,
  type TickTickProjectData,
  type TickTickTask,
} from "./schema.ts";

const NAME = "ticktick";
const API_BASE = "https://api.ticktick.com/open/v1";
const AUTH_ENDPOINT = "https://ticktick.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://ticktick.com/oauth/token";

const createTickTickClient = (
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): OAuthClient => {
  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  return {
    createAuthorizationURL: (state, _codeVerifier, scopes) =>
      client.createAuthorizationURL(AUTH_ENDPOINT, state, scopes),
    validateAuthorizationCode: (code, _codeVerifier) =>
      client.validateAuthorizationCode(TOKEN_ENDPOINT, code, null),
    refreshAccessToken: (refreshToken) =>
      client.refreshAccessToken(TOKEN_ENDPOINT, refreshToken, []),
  };
};

const oauth: OAuthSetup = {
  createClient: createTickTickClient,
  scopes: ["tasks:read", "tasks:write"],
};

const isTokenExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) return true;
  return DateTime.fromISO(expiresAt).minus({ minutes: 5 }) < DateTime.now();
};

const getValidToken = (
  container: Container,
  pluginConfig: PluginConfig<TickTickConfig>,
): ResultAsync<string, AppError> => {
  const { log } = container;
  const { config } = pluginConfig;

  if (!config.accessToken) {
    return errAsync(appError("plugin", "Not authenticated"));
  }

  if (isTokenExpired(config.tokenExpiresAt)) {
    log.info`TickTick token expired, refreshing...`;
    return refreshPluginToken(NAME, oauth, container).map((t) => t.accessToken);
  }

  return okAsync(config.accessToken);
};

const fetchProjects = (
  accessToken: string,
  log: Container["log"],
): ResultAsync<TickTickProject[], AppError> =>
  ResultAsync.fromPromise(
    fetch(`${API_BASE}/project`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        log.error`TickTick projects API error: ${res.status} ${text}`;
        throw new Error(`Projects API error: ${res.status}`);
      }
      return res.json();
    }),
    pluginError("TickTick projects fetch failed"),
  );

const fetchProjectData = (
  accessToken: string,
  projectId: string,
  log: Container["log"],
): ResultAsync<TickTickTask[], AppError> =>
  ResultAsync.fromPromise(
    fetch(`${API_BASE}/project/${encodeURIComponent(projectId)}/data`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        log.error`TickTick project data API error: ${res.status} ${text}`;
        throw new Error(`Project data API error: ${res.status}`);
      }
      return res.json();
    }),
    pluginError("TickTick project data fetch failed"),
  ).map((data: TickTickProjectData) => data.tasks ?? []);

const priorityLabel = (priority: number): string => {
  switch (priority) {
    case 5:
      return "high";
    case 3:
      return "medium";
    case 1:
      return "low";
    default:
      return "";
  }
};

const formatTask = (task: TickTickTask, projectName: string): string => {
  const parts = [`TickTick: ${task.title}`];
  if (projectName) parts.push(`[${projectName}]`);
  const pLabel = priorityLabel(task.priority);
  if (pLabel) parts.push(`(${pLabel} priority)`);
  return parts.join(" ");
};

export const ticktickPlugin: Plugin<TickTickConfig> = {
  name: NAME,
  displayName: "TickTick",
  configSchema,
  oauth,
  init: (app, container) => {
    registerOAuthRoutes(app, NAME, oauth, container);
  },
  cronJobs: (config) => [
    {
      name: "ticktick-sync",
      schedule: config?.["ticktick-sync-schedule"] ?? "0 */6 * * *",
      run: (container, job) => {
        const { log, memory, plugins } = container;

        return plugins
          .getConfig<TickTickConfig>(NAME)
          .andThen((pluginConfig) => {
            if (!pluginConfig) {
              return errAsync(appError("plugin", `[${job.name}] Not configured`));
            }
            return getValidToken(container, pluginConfig)
              .andThen((accessToken) =>
                fetchProjects(accessToken, log)
                  .andThen((projects) => {
                    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
                    return ResultAsync.combine(
                      projects.map((p) => fetchProjectData(accessToken, p.id, log)),
                    ).map((taskArrays) =>
                      taskArrays.flat().filter((t) => t.status === 0).map((t) => ({
                        task: t,
                        projectName: projectMap.get(t.projectId) ?? "",
                      }))
                    );
                  })
              )
              .andTee((tasks) => {
                log.info`[${job.name}] Fetched ${tasks.length} incomplete tasks`;
              })
              .andThen((tasks) =>
                ResultAsync.combine(
                  tasks.map(({ task, projectName }) => {
                    const date = task.dueDate
                      ? DateTime.fromISO(task.dueDate).toISODate() ?? null
                      : null;
                    return memory.updateMemories(
                      {
                        memories: [{ date, text: formatTask(task, projectName) }],
                        editMemories: [],
                        deleteMemories: [],
                        response: "",
                      },
                      pluginConfig,
                    );
                  }),
                ).map(() => ({ synced: tasks.length }))
              );
          });
      },
    },
  ],
};
