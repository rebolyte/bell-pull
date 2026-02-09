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

// they don't expose a way to get the inbox ID...
const discoverInboxId = (
  accessToken: string,
  log: Container["log"],
): ResultAsync<string, AppError> =>
  ResultAsync.fromPromise(
    fetch(`${API_BASE}/task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Test task" }),
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        log.error`TickTick create task API error: ${res.status} ${text}`;
        throw new Error(`Create task API error: ${res.status}`);
      }
      return res.json();
    }),
    pluginError("TickTick discover inbox failed"),
  ).andThen((task: { id: string; projectId: string }) =>
    ResultAsync.fromPromise(
      fetch(
        `${API_BASE}/project/${encodeURIComponent(task.projectId)}/task/${
          encodeURIComponent(
            task.id,
          )
        }`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      ).then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          log.error`TickTick delete task API error: ${res.status} ${text}`;
          throw new Error(`Delete task API error: ${res.status}`);
        }
      }),
      pluginError("TickTick delete test task failed"),
    ).map(() => task.projectId)
  );

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

    app.get(`/api/plugins/${NAME}/projects`, async (c) => {
      const { plugins, log } = container;
      return plugins
        .getConfig<TickTickConfig>(NAME)
        .andThen((pluginConfig) => {
          if (!pluginConfig) {
            return errAsync(appError("plugin", "Plugin not configured"));
          }
          return getValidToken(container, pluginConfig).andThen(
            (accessToken) => {
              const existing = pluginConfig.config as Record<string, unknown>;
              const maybeDiscover = pluginConfig.config.inboxProjectId
                ? okAsync(pluginConfig.config.inboxProjectId)
                : discoverInboxId(accessToken, log).andThen((inboxId) =>
                  plugins
                    .setConfig(NAME, { ...existing, inboxProjectId: inboxId })
                    .map(() => inboxId)
                );
              return maybeDiscover.andThen((inboxProjectId) =>
                fetchProjects(accessToken, log).map((allProjects) => ({
                  pluginConfig: {
                    ...pluginConfig,
                    config: {
                      ...pluginConfig.config,
                      inboxProjectId: inboxProjectId ?? pluginConfig.config.inboxProjectId,
                    },
                  } as PluginConfig<TickTickConfig>,
                  allProjects,
                }))
              );
            },
          );
        })
        .match(
          ({ pluginConfig, allProjects }) => {
            const selected = pluginConfig.config.selectedProjects ?? [];
            const inboxId = pluginConfig.config.inboxProjectId;
            return c.html(
              <div>
                <h3>Project Selection</h3>
                <form
                  hx-post={`/api/plugins/${NAME}/projects`}
                  hx-target="#ticktick-projects"
                  hx-swap="innerHTML"
                >
                  {inboxId
                    ? (
                      <label style="display: block; margin: 0.5rem 0;">
                        <input
                          type="checkbox"
                          name="projectId"
                          value={inboxId}
                          checked={selected.includes(inboxId)}
                        />
                        Inbox
                      </label>
                    )
                    : null}
                  {allProjects.map((project) => (
                    <label style="display: block; margin: 0.5rem 0;">
                      <input
                        type="checkbox"
                        name="projectId"
                        value={project.id}
                        checked={selected.includes(project.id)}
                      />
                      {project.name}
                    </label>
                  ))}
                  <button type="submit" style="margin-top: 1rem;">
                    Save
                  </button>
                </form>
              </div>,
            );
          },
          (error) => {
            log.error`[${NAME}] Failed to fetch projects: ${error.message}`;
            return c.html(
              <div class="error">Failed to load projects: {error.message}</div>,
            );
          },
        );
    });

    app.post(`/api/plugins/${NAME}/projects`, async (c) => {
      const { plugins, log } = container;
      const formData = await c.req.formData();
      const selectedIds = formData.getAll("projectId") as string[];

      return plugins
        .getConfig<TickTickConfig>(NAME)
        .andThen((pluginConfig) => {
          if (!pluginConfig) {
            return errAsync(appError("plugin", "Plugin not configured"));
          }
          const existing = pluginConfig.config as Record<string, unknown>;
          const merged = { ...existing, selectedProjects: selectedIds };
          return plugins.setConfig(NAME, merged);
        })
        .andThen(() => plugins.getConfig<TickTickConfig>(NAME))
        .andThen((pluginConfig) => {
          if (!pluginConfig) {
            return errAsync(appError("plugin", "Plugin not configured"));
          }
          return getValidToken(container, pluginConfig)
            .andThen((accessToken) => fetchProjects(accessToken, log))
            .map((allProjects) => ({
              allProjects,
              selectedIds,
              inboxId: pluginConfig.config.inboxProjectId,
            }));
        })
        .match(
          ({ allProjects, selectedIds, inboxId }) => {
            return c.html(
              <div>
                <h3>Project Selection</h3>
                <div class="success" style="margin-bottom: 1rem;">
                  Projects saved successfully
                </div>
                <form
                  hx-post={`/api/plugins/${NAME}/projects`}
                  hx-target="#ticktick-projects"
                  hx-swap="innerHTML"
                >
                  {inboxId
                    ? (
                      <label style="display: block; margin: 0.5rem 0;">
                        <input
                          type="checkbox"
                          name="projectId"
                          value={inboxId}
                          checked={selectedIds.includes(inboxId)}
                        />
                        Inbox
                      </label>
                    )
                    : null}
                  {allProjects.map((project) => (
                    <label style="display: block; margin: 0.5rem 0;">
                      <input
                        type="checkbox"
                        name="projectId"
                        value={project.id}
                        checked={selectedIds.includes(project.id)}
                      />
                      {project.name}
                    </label>
                  ))}
                  <button type="submit" style="margin-top: 1rem;">
                    Save
                  </button>
                </form>
              </div>,
            );
          },
          (error) => {
            log.error`[${NAME}] Failed to save projects: ${error.message}`;
            return c.html(
              <div class="error">Failed to save projects: {error.message}</div>,
            );
          },
        );
    });
  },
  settingsUI: (config) => (
    <div class="custom-section" id="ticktick-projects">
      {config.accessToken
        ? (
          <div
            hx-get={`/api/plugins/${NAME}/projects`}
            hx-trigger="load"
            hx-swap="innerHTML"
          >
            Loading projects...
          </div>
        )
        : <p>Connect to TickTick first.</p>}
    </div>
  ),
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
              return errAsync(
                appError("plugin", `[${job.name}] Not configured`),
              );
            }
            return getValidToken(container, pluginConfig)
              .andThen((accessToken) =>
                fetchProjects(accessToken, log).andThen((allProjects) => {
                  const selected = pluginConfig.config.selectedProjects;
                  const inboxId = pluginConfig.config.inboxProjectId;
                  const idsToFetch = selected?.length ? selected : allProjects.map((p) => p.id);
                  const projectMap = new Map(
                    allProjects.map((p) => [p.id, p.name]),
                  );
                  if (inboxId) {
                    projectMap.set(inboxId, "Inbox");
                  }
                  return ResultAsync.combine(
                    idsToFetch.map((id) => fetchProjectData(accessToken, id, log)),
                  ).map((taskArrays) =>
                    taskArrays
                      .flat()
                      .filter((t) => t.status === 0)
                      .map((t) => ({
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
                      ? (DateTime.fromISO(task.dueDate).toISODate() ?? null)
                      : null;
                    return memory.updateMemories(
                      {
                        memories: [
                          {
                            date,
                            text: formatTask(task, projectName),
                            externalId: task.id,
                            original: JSON.stringify(task),
                          },
                        ],
                        editMemories: [],
                        deleteMemories: [],
                        response: "",
                      },
                      pluginConfig,
                    );
                  }),
                )
                  .andThen(() => {
                    const currentIds = tasks.map(({ task }) => task.id);
                    return memory.removeStaleMemories(NAME, currentIds);
                  })
                  .map(() => ({ synced: tasks.length }))
              );
          });
      },
    },
  ],
};
