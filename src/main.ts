import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import apiRoutes from "./routes/api.tsx";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

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

const port = Number(Deno.env.get("PORT")) || 8000;

console.log(`🚀 Server running on http://localhost:${port}`);

Deno.serve({ port }, app.fetch);
