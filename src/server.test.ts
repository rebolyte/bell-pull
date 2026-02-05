import { assertEquals } from "@std/assert";
import { createTestDb } from "./utils/harness.ts";
import { makeContainer } from "./container.ts";
import { run } from "./main.ts";

Deno.test("Integration Test: Server Lifecycle", async (t) => {
  // 1. Setup DB
  const db = await createTestDb();

  // 2. Setup Container
  const container = await makeContainer({
    db,
    config: {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat",
      ANTHROPIC_API_KEY: "test-key",
    },
  });

  // 3. Start Server
  const abortController = new AbortController();
  const server = await run({
    port: 0,
    container,
    signal: abortController.signal,
    enableCrons: false,
  });

  const { port, hostname } = server.addr;
  const host = hostname === "0.0.0.0" ? "localhost" : hostname;
  const baseUrl = `http://${host}:${port}`;

  console.log(`Test server running at ${baseUrl}`);

  await t.step("Health check", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.status, "healthy");
  });

  await t.step("RPC call", async () => {
    const { newHttpBatchRpcSession } = await import("capnweb");
    const session = (newHttpBatchRpcSession as any)(`${baseUrl}/api/rpc`);
    const n = await session.getCounter();
    assertEquals(typeof n, "number");
  });

  // Teardown
  abortController.abort();
  await server.finished;
  await db.destroy();
});
