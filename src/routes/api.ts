import { Hono } from "hono";
import { ExampleRpcService } from "../services/example-rpc.ts";
import { createRpcHandler } from "../utils/capnweb-setup.ts";

const api = new Hono();

// Initialize RPC service
const rpcService = new ExampleRpcService();
const rpcHandler = createRpcHandler(rpcService);

// Traditional REST endpoints
api.get("/users/:id", (c) => {
  const id = c.req.param("id");
  return c.json({
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
  });
});

api.post("/users", async (c) => {
  const body = await c.req.json();
  return c.json({
    message: "User created",
    user: body,
  }, 201);
});

// RPC-style endpoint demonstrating capnweb pattern
api.post("/rpc", async (c) => {
  try {
    const body = await c.req.json();
    const result = await rpcHandler(body);
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Invalid request",
    }, 400);
  }
});

// Example endpoints demonstrating different RPC methods
api.get("/rpc/hello/:name", async (c) => {
  const name = c.req.param("name");
  const result = await rpcService.hello(name);
  return c.json({ result });
});

api.post("/rpc/add", async (c) => {
  const { a, b } = await c.req.json();
  const result = await rpcService.add(a, b);
  return c.json({ result });
});

api.post("/rpc/batch", async (c) => {
  const { items } = await c.req.json();
  const result = await rpcService.processBatch(items);
  return c.json(result);
});

// Info endpoint
api.get("/info", (c) => {
  return c.json({
    name: "Deno + Hono + CapnWeb API",
    description: "Example API demonstrating RPC patterns with Cap'n Web",
    endpoints: {
      rest: {
        "GET /api/users/:id": "Get user by ID",
        "POST /api/users": "Create a new user",
      },
      rpc: {
        "POST /api/rpc": "Generic RPC endpoint (send {method, args})",
        "GET /api/rpc/hello/:name": "Hello RPC method",
        "POST /api/rpc/add": "Add two numbers (send {a, b})",
        "POST /api/rpc/batch": "Process batch items (send {items})",
      },
    },
    capnweb: {
      info: "This API demonstrates Cap'n Web RPC patterns",
      docs: "https://github.com/cloudflare/capnweb",
    },
  });
});

export default api;
