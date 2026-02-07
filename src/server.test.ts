import { assertEquals } from "@std/assert";
import { createTestDb } from "./utils/harness.ts";
import { makeContainer } from "./container.ts";
import { run } from "./main.ts";

const toBaseUrl = (server: Deno.HttpServer) => {
  const { port, hostname } = server.addr;
  const host = hostname === "0.0.0.0" ? "localhost" : hostname;
  return `http://${host}:${port}`;
};

Deno.test("Integration Test: Server Lifecycle", async (t) => {
  const db = await createTestDb();

  const container = await makeContainer({
    db,
    config: {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat",
      ANTHROPIC_API_KEY: "test-key",
    },
  });

  const abortController = new AbortController();
  const servers = await run({
    publicPort: 0,
    adminPort: 0,
    container,
    signal: abortController.signal,
    enableCrons: false,
  });

  const publicUrl = toBaseUrl(servers.public);
  const adminUrl = toBaseUrl(servers.admin);

  console.log(`Public server at ${publicUrl}, Admin server at ${adminUrl}`);

  await t.step("Public health check", async () => {
    const res = await fetch(`${publicUrl}/health`);
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.status, "healthy");
  });

  await t.step("Admin health check", async () => {
    const res = await fetch(`${adminUrl}/health`);
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.status, "healthy");
  });

  await t.step("RPC on admin", async () => {
    const { newHttpBatchRpcSession } = await import("capnweb");
    const session = (newHttpBatchRpcSession as any)(`${adminUrl}/api/rpc`);
    const n = await session.getCounter();
    assertEquals(typeof n, "number");
  });

  await t.step("Public 404 on admin routes", async () => {
    const res = await fetch(`${publicUrl}/api/rpc`, { method: "POST" });
    assertEquals(res.status, 404);
  });

  abortController.abort();
  await Promise.all([servers.public.finished, servers.admin.finished]);
  await db.destroy();
});
