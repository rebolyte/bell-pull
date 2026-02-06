import { Hono } from "hono";
import { honoLogger } from "@logtape/hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import type { Container, HonoEnv } from "./types/index.ts";
import { makeApiRoutes } from "./routes/api.tsx";
import { makeDashboardRoutes } from "./routes/dashboard/index.tsx";
import { makePluginRoutes } from "./routes/dashboard/plugins.tsx";
import { plugins } from "./plugins/registry.ts";
import { registerPluginCrons } from "./cron-runner.ts";

export interface ServerOptions {
  enableCrons?: boolean;
}

export const makeServer = async (
  container: Container,
  opts: ServerOptions = { enableCrons: true },
) => {
  const app = new Hono<HonoEnv>();

  // Middleware
  app.use(honoLogger({
    category: ["app", "hono"],
  }));
  app.use("*", cors());
  app.use("*", async (c, next) => {
    c.set("container", container);
    await next();
  });
  const staticRoot = new URL("./static", import.meta.url).pathname;
  app.use(
    "/static/*",
    serveStatic({
      root: staticRoot,
      rewriteRequestPath: (path) => path.replace(/^\/static\/?/, ""),
    }),
  );

  const enableCrons = opts.enableCrons !== false;

  // Register plugin routes and crons
  for (const plugin of plugins) {
    plugin.init?.(app, container);

    if (enableCrons) {
      await registerPluginCrons(plugin, container);
    }
  }

  // Routes
  app.get("/", (c) => {
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
        body: {
          method: "getCounter",
          params: [],
        },
        response: {
          result: 0,
        },
      },
    });
  });

  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API routes
  app.route("/api", makeApiRoutes(plugins));

  // Mount dashboard routes
  app.route("/dashboard", makeDashboardRoutes(plugins));
  app.route("/dashboard/plugins", makePluginRoutes(plugins));

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: "Not Found" }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    container.log.error`Error: ${err.message}`;
    return c.json({
      error: err.message,
    }, 500);
  });

  return app;
};
