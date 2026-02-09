import { Hono } from "hono";
import { honoLogger } from "@logtape/hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import type { Container, HonoEnv, ServerApps } from "./types/index.ts";
import { makeApiRoutes } from "./routes/api.tsx";
import { makeDashboardRoutes } from "./routes/dashboard/index.tsx";
import { makePluginRoutes } from "./routes/dashboard/plugins.tsx";
import { plugins } from "./plugins/registry.ts";
import { registerPluginCrons } from "./cron-runner.ts";

export interface ServerOptions {
  enableCrons?: boolean;
}

const makeBaseApp = (container: Container): Hono<HonoEnv> => {
  const app = new Hono<HonoEnv>();

  app.use(honoLogger({ category: ["app", "hono"] }));
  app.use("*", cors());
  app.use("*", async (c, next) => {
    c.set("container", container);
    await next();
  });

  app.get("/health", (c) => c.json({ status: "healthy", timestamp: new Date().toISOString() }));

  app.onError((err, c) => {
    container.log.error`Error: ${err.message}`;
    return c.json({ error: err.message }, 500);
  });

  return app;
};

export const makeServers = async (
  container: Container,
  opts: ServerOptions = { enableCrons: true },
): Promise<ServerApps> => {
  const publicApp = makeBaseApp(container);
  const adminApp = makeBaseApp(container);

  const staticRoot = new URL("./static", import.meta.url).pathname;
  adminApp.use(
    "/static/*",
    serveStatic({
      root: staticRoot,
      rewriteRequestPath: (path) => path.replace(/^\/static\/?/, ""),
    }),
  );

  adminApp.get("/", (c) => {
    return c.json({
      message: "Deno + Hono + CapnWeb API",
      version: "1.0.0",
      description: "Single RPC endpoint for all method calls",
      endpoints: {
        dashboard: "/api/dashboard - Interactive dashboard with AlpineJS",
        health: "/health - Health check",
        rpc: "POST /api/rpc - Single RPC endpoint (send {method, params})",
      },
      availableMethods: {
        counter: ["getCounter", "incrementCounter", "decrementCounter", "resetCounter"],
        plugins: [
          "getPlugins",
          "getPluginConfig",
          "setPluginConfig",
          "setPluginEnabled",
          "getOAuthStatus",
        ],
      },
      exampleCall: {
        url: "/api/rpc",
        method: "POST",
        body: { method: "getCounter", params: [] },
        response: { result: 0 },
      },
    });
  });

  adminApp.route("/api", makeApiRoutes(plugins));
  adminApp.route("/dashboard", makeDashboardRoutes(plugins));
  adminApp.route("/dashboard/plugins", makePluginRoutes(plugins));

  const enableCrons = opts.enableCrons !== false;
  const apps: ServerApps = { public: publicApp, admin: adminApp };

  for (const plugin of plugins) {
    plugin.init?.(apps, container);

    if (enableCrons) {
      await registerPluginCrons(plugin, container);
    }
  }

  publicApp.notFound((c) => c.json({ error: "Not Found" }, 404));
  adminApp.notFound((c) => c.json({ error: "Not Found" }, 404));

  return apps;
};
