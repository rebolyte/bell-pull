import { Hono } from "hono";
import { newHttpBatchRpcResponse } from "capnweb";
import { PluginsRpcService } from "../services/plugins-rpc.ts";
import type { HonoEnv, Plugin } from "../types/index.ts";

const api = new Hono<HonoEnv>();

// Store chat message
api.post("/messages", async (c) => {
  const body = await c.req.json();
  // const { chatId, senderId, senderName, message, isBot } = body;

  const container = c.get("container");

  // Call the domain method
  // Note: We await the result of match() because the handlers might be async or return promises
  return container.messages.storeChatMessage(body).match(
    (result) => c.json({ success: true, result }),
    (error) => {
      console.error("Failed to store message:", error);
      return c.json({ success: false, error: JSON.parse(error.message) }, 500);
    },
  );
});

export const makeApiRoutes = (plugins: Plugin[]) => {
  // RPC endpoint with all methods (example + plugins)
  api.all("/rpc", async (c) => {
    const container = c.get("container");
    const request = c.req.raw;
    const response = await newHttpBatchRpcResponse(
      request,
      new PluginsRpcService(container, plugins),
    );
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  });

  return api;
};

export default api;
