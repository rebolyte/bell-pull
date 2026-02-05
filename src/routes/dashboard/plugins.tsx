import { Hono } from "hono";
import type { HonoEnv, Plugin } from "../../types/index.ts";
import type { PluginInfo } from "../../types/shared.ts";
import { DashboardShell, Layout } from "../components/layout.tsx";
import { CronJobRow, EnabledToggle, PluginSettings } from "../components/settings/plugin.tsx";
import { extractFieldsFromSchema } from "../../services/config-schema.ts";
import { parseFormToConfig } from "../../utils/form.ts";

type PluginRoutesEnv = HonoEnv & { Variables: { plugins: Plugin[] } };

const getBaseUrl = (req: Request): string => {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

const getPluginsList = async (
  container: HonoEnv["Variables"]["container"],
  plugins: Plugin[],
  storedConfigs?: Map<string, Record<string, unknown>>,
): Promise<PluginInfo[]> => {
  const configsResult = await container.plugins.listConfigs();
  const configs = configsResult.isOk() ? configsResult.value : [];

  return plugins.map((plugin) => {
    const stored = configs.find((c) => c.pluginName === plugin.name);
    const storedConfig = storedConfigs?.get(plugin.name) ?? {};
    const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];
    const jobs = typeof plugin.cronJobs === "function"
      ? plugin.cronJobs(storedConfig)
      : plugin.cronJobs ?? [];
    const cronJobs = jobs.map((j) => ({
      name: j.name,
      scheduleField: `${j.name}-schedule`,
      schedule: (storedConfig[`${j.name}-schedule`] as string) ?? j.schedule,
    }));

    return {
      name: plugin.name,
      displayName: plugin.displayName ?? plugin.name,
      hasOAuth: !!plugin.oauth,
      enabled: stored?.enabled ?? false,
      configured: !!stored,
      fields,
      jsonSchema: null,
      cronJobs: cronJobs.length > 0 ? cronJobs : undefined,
    };
  });
};

async function getOAuthStatus(
  container: HonoEnv["Variables"]["container"],
  pluginName: string,
): Promise<{ connected: boolean; expiresAt?: string }> {
  const result = await container.plugins.getConfig<{
    accessToken?: string;
    tokenExpiresAt?: string;
  }>(pluginName);

  if (result.isErr() || !result.value) {
    return { connected: false };
  }

  const { accessToken, tokenExpiresAt } = result.value.config;
  return {
    connected: !!accessToken,
    expiresAt: tokenExpiresAt,
  };
}

export const makePluginRoutes = (plugins: Plugin[]) => {
  const pluginRoutes = new Hono<PluginRoutesEnv>();

  pluginRoutes.use("*", async (c, next) => {
    c.set("plugins", plugins);
    await next();
  });

  pluginRoutes.get("/:name", async (c) => {
    const name = c.req.param("name");
    const flash = c.req.query("flash");
    const flashMessage = c.req.query("message");
    const container = c.get("container");
    const pluginDefs = c.get("plugins");
    const baseUrl = getBaseUrl(c.req.raw);

    const plugin = pluginDefs.find((p) => p.name === name);
    if (!plugin) {
      return c.redirect("/dashboard/general?flash=plugin-not-found");
    }

    const [configResult, oauthStatus] = await Promise.all([
      container.plugins.getConfig(name),
      getOAuthStatus(container, name),
    ]);

    const config = configResult.isOk() && configResult.value
      ? (configResult.value.config as Record<string, unknown>)
      : {};
    const storedConfigs = new Map([[name, config]]);
    const pluginsList = await getPluginsList(
      container,
      pluginDefs,
      storedConfigs,
    );

    const pluginInfo = pluginsList.find((p) => p.name === name)!;
    const customUI = plugin.settingsUI?.(config, container);

    return c.html(
      <Layout title={`Bell Pull - ${pluginInfo.displayName}`}>
        <DashboardShell
          plugins={pluginsList}
          currentPath={`/dashboard/plugins/${name}`}
        >
          <PluginSettings
            plugin={pluginInfo}
            config={config}
            oauthStatus={oauthStatus}
            baseUrl={baseUrl}
            flash={flash}
            flashMessage={flashMessage}
            customUI={customUI}
          />
        </DashboardShell>
      </Layout>,
    );
  });

  pluginRoutes.post("/:name/config", async (c) => {
    const name = c.req.param("name");
    const container = c.get("container");
    const pluginDefs = c.get("plugins");

    const plugin = pluginDefs.find((p) => p.name === name);
    if (!plugin) {
      return c.redirect(
        `/dashboard/plugins/${name}?flash=error&message=Plugin+not+found`,
      );
    }

    const formData = await c.req.parseBody();
    const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];
    const config = parseFormToConfig(
      formData as Record<string, string | File>,
      fields,
    );

    if (plugin.configSchema) {
      const parseResult = plugin.configSchema.safeParse(config);
      if (!parseResult.success) {
        const errorMsg = encodeURIComponent(
          parseResult.error.issues[0]?.message ?? "Validation failed",
        );
        return c.redirect(
          `/dashboard/plugins/${name}?flash=error&message=${errorMsg}`,
        );
      }
    }

    const result = await container.plugins.setConfig(name, config);
    if (result.isErr()) {
      const errorMsg = encodeURIComponent(result.error.message);
      return c.redirect(
        `/dashboard/plugins/${name}?flash=error&message=${errorMsg}`,
      );
    }

    return c.redirect(`/dashboard/plugins/${name}?flash=saved`);
  });

  pluginRoutes.post("/:name/toggle", async (c) => {
    const name = c.req.param("name");
    const container = c.get("container");
    const pluginDefs = c.get("plugins");
    const body = await c.req.parseBody();

    const enabled = body.enabled === "true";
    await container.plugins.setEnabled(name, enabled);

    const pluginsList = await getPluginsList(container, pluginDefs);
    const pluginInfo = pluginsList.find((p) => p.name === name)!;

    return c.html(<EnabledToggle plugin={pluginInfo} />);
  });

  pluginRoutes.post("/:name/cron/:jobName/run", async (c) => {
    const name = c.req.param("name");
    const jobName = c.req.param("jobName");
    const container = c.get("container");
    const pluginDefs = c.get("plugins");

    const plugin = pluginDefs.find((p) => p.name === name);
    if (!plugin) {
      return c.html(
        <CronJobRow
          pluginName={name}
          jobName={jobName}
          status="error"
          message="Plugin not found"
        />,
      );
    }

    const configResult = await container.plugins.getConfig(name);
    const config = configResult.isOk() && configResult.value
      ? (configResult.value.config as Record<string, unknown>)
      : {};

    const jobs = typeof plugin.cronJobs === "function"
      ? plugin.cronJobs(config)
      : plugin.cronJobs ?? [];
    const job = jobs.find((j) => j.name === jobName);

    if (!job) {
      return c.html(
        <CronJobRow
          pluginName={name}
          jobName={jobName}
          status="error"
          message="Job not found"
        />,
      );
    }

    const ctx = { name: job.name, schedule: job.schedule };
    const result = await job.run(container, ctx);

    if (result.isErr()) {
      container.log.error(`Error running ${job.name} job`, {
        error: result.error,
      });

      return c.html(
        <CronJobRow
          pluginName={name}
          jobName={jobName}
          status="error"
          message={result.error.message}
        />,
      );
    }

    return c.html(
      <CronJobRow pluginName={name} jobName={jobName} status="success" />,
    );
  });

  return pluginRoutes;
};
