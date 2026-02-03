import { Hono } from "hono";
import type { HonoEnv, Plugin } from "../../types/index.ts";
import type { PluginInfo } from "../../types/shared.ts";
import { DashboardShell, Layout } from "../components/layout.tsx";
import { EnabledToggle, PluginSettings } from "../components/settings/plugin.tsx";
import {
  extractFieldsFromSchema,
  maskSecrets,
  mergeWithExistingSecrets,
} from "../../services/config-schema.ts";
import { parseFormToConfig } from "../../utils/form.ts";

type PluginRoutesEnv = HonoEnv & { Variables: { plugins: Plugin[] } };

const getBaseUrl = (req: Request): string => {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

const getPluginsList = async (
  container: HonoEnv["Variables"]["container"],
  plugins: Plugin[],
): Promise<PluginInfo[]> => {
  const configsResult = await container.plugins.listConfigs();
  const configs = configsResult.isOk() ? configsResult.value : [];

  return plugins.map((plugin) => {
    const stored = configs.find((c) => c.pluginName === plugin.name);
    const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];

    return {
      name: plugin.name,
      displayName: plugin.displayName ?? plugin.name,
      hasOAuth: !!plugin.oauth,
      enabled: stored?.enabled ?? false,
      configured: !!stored,
      fields,
      jsonSchema: null,
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

    const [pluginsList, configResult, oauthStatus] = await Promise.all([
      getPluginsList(container, pluginDefs),
      container.plugins.getConfig(name),
      getOAuthStatus(container, name),
    ]);

    const pluginInfo = pluginsList.find((p) => p.name === name)!;
    const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];
    const rawConfig = configResult.isOk() && configResult.value
      ? (configResult.value.config as Record<string, unknown>)
      : {};
    const config = maskSecrets(rawConfig, fields);

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

    const existingResult = await container.plugins.getConfig(name);
    const existingConfig = existingResult.isOk() && existingResult.value
      ? (existingResult.value.config as Record<string, unknown>)
      : {};

    const mergedConfig = mergeWithExistingSecrets(
      config,
      existingConfig,
      fields,
    );

    const result = await container.plugins.setConfig(name, mergedConfig);
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

  return pluginRoutes;
};
