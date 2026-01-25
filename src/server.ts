import { Hono } from "hono";
import { honoLogger } from "@logtape/hono";
import { cors } from "hono/cors";
import type { Container, HonoEnv } from "./types/index.ts";
import { makeApiRoutes } from "./routes/api.tsx";
import { plugins } from "./plugins/registry.ts";
import { scheduleCron } from "./cron-runner.ts";
import { registerOAuthRoutes } from "./services/oauth.ts";

export interface ServerOptions {
  enableCrons?: boolean;
}

export const makeServer = (container: Container, opts: ServerOptions = { enableCrons: true }) => {
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

  const enableCrons = opts.enableCrons !== false;

  // Register plugin routes and crons
  plugins.forEach((plugin) => {
    plugin.init?.(app, container);
    registerOAuthRoutes(app, plugin, container);

    if (enableCrons) {
      const jobs = typeof plugin.cronJobs === "function"
        ? plugin.cronJobs({}) // TODO: pass actual config when available
        : plugin.cronJobs ?? [];
      jobs.forEach((job) => scheduleCron(job, container));
    }
  });

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
        basic: ["hello", "add", "multiply", "processBatch"],
        users: ["createUser", "getUserInfo", "updateUserPreferences"],
        todos: ["createTodo", "getTodos", "toggleTodo"],
      },
      exampleCall: {
        url: "/api/rpc",
        method: "POST",
        body: {
          method: "add",
          params: [5, 3],
        },
        response: {
          result: 8,
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
