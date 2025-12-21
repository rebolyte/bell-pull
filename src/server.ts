import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import cron from "node-cron";
import type { Container, HonoEnv, Plugin } from "./types/index.ts";
import apiRoutes from "./routes/api.tsx";
import { letterboxdPlugin } from "./plugins/letterboxd/index.ts";
import { telegramPlugin } from "./plugins/telegram/index.ts";

export interface ServerOptions {
  enableCrons?: boolean;
}

export const makeServer = (container: Container, opts: ServerOptions = { enableCrons: true }) => {
  const app = new Hono<HonoEnv>();

  // Middleware
  app.use("*", logger());
  app.use("*", cors());
  app.use("*", async (c, next) => {
    c.set("container", container);
    await next();
  });

  const plugins: Plugin[] = [telegramPlugin, letterboxdPlugin];

  // 2. Register Crons
  plugins.forEach((p) => {
    p.init?.(app, container);

    if (opts.enableCrons && p.cronJobs) {
      p.cronJobs.forEach((job) => {
        cron.schedule(job.schedule, async () => {
          console.log(`Running ${p.name} job...`);
          await job.run();
        });
      });
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
  app.route("/api", apiRoutes);

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: "Not Found" }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error(`Error: ${err.message}`);
    return c.json({
      error: err.message,
    }, 500);
  });

  return app;
};
