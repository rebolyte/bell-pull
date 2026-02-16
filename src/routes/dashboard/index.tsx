import { Hono } from "hono";
import type { Container, HonoEnv, Plugin } from "../../types/index.ts";
import type { PluginInfo } from "../../types/shared.ts";
import { DashboardShell, Layout } from "../components/layout.tsx";
import { GeneralSettings } from "../components/settings/general.tsx";
import { MemoriesSettings } from "../components/settings/memories.tsx";
import { MessagesSettings } from "../components/settings/messages.tsx";
import { extractFieldsFromSchema } from "../../services/config-schema.ts";

type DashboardEnv = HonoEnv & { Variables: { plugins: Plugin[] } };

const getPluginsList = async (
  container: Container,
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
      configured: !!stored,
      fields,
      jsonSchema: null,
    };
  });
};

export const makeDashboardRoutes = (plugins: Plugin[]) => {
  const dashboard = new Hono<DashboardEnv>();

  dashboard.use("*", async (c, next) => {
    c.set("plugins", plugins);
    await next();
  });

  dashboard.get("/", (c) => c.redirect("/dashboard/general"));

  dashboard.get("/general", async (c) => {
    const container = c.get("container");
    const pluginDefs = c.get("plugins");
    const pluginsList = await getPluginsList(container, pluginDefs);
    const flash = c.req.query("flash");

    return c.html(
      <Layout title="Bell Pull - General">
        <DashboardShell plugins={pluginsList} currentPath="/dashboard/general">
          <GeneralSettings flash={flash} />
        </DashboardShell>
      </Layout>,
    );
  });

  dashboard.get("/memories", async (c) => {
    const container = c.get("container");
    const pluginDefs = c.get("plugins");
    const pluginsList = await getPluginsList(container, pluginDefs);
    const flash = c.req.query("flash");

    return c.html(
      <Layout title="Bell Pull - Memories">
        <DashboardShell plugins={pluginsList} currentPath="/dashboard/memories">
          <MemoriesSettings flash={flash} />
        </DashboardShell>
      </Layout>,
    );
  });

  dashboard.get("/messages", async (c) => {
    const container = c.get("container");
    const pluginDefs = c.get("plugins");
    const pluginsList = await getPluginsList(container, pluginDefs);
    const flash = c.req.query("flash");

    return c.html(
      <Layout title="Bell Pull - Messages">
        <DashboardShell plugins={pluginsList} currentPath="/dashboard/messages">
          <MessagesSettings flash={flash} />
        </DashboardShell>
      </Layout>,
    );
  });

  return dashboard;
};
