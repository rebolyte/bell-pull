/**
 * Example Cap'n Web Client
 *
 * This demonstrates proper usage of the Cap'n Web client library.
 * To use this in a browser, you would need to bundle it with esbuild, vite, etc.
 *
 * For server-side usage or bundled client apps:
 */

import { newHttpBatchRpcSession, type RpcStub } from "capnweb";
import type { ExampleRpcMethods } from "./types/shared.ts";

// Create a typed RPC session
export async function exampleClientUsage() {
  // Using `using` for automatic cleanup
  using stub: RpcStub<ExampleRpcMethods> = newHttpBatchRpcSession<ExampleRpcMethods>(
    "http://localhost:8000/api/rpc"
  );

  // Example 1: Single call
  const greeting = await stub.hello("Alice");
  console.log(greeting);

  // Example 2: Batched calls - all sent in ONE HTTP request!
  const sum = stub.add(5, 3);
  const product = stub.multiply(10, 4);
  const batch = stub.processBatch(["hello", "world"]);

  // Await all at once - still just one HTTP request
  const [sumResult, productResult, batchResult] = await Promise.all([sum, product, batch]);
  console.log("Sum:", sumResult);
  console.log("Product:", productResult);
  console.log("Batch:", batchResult);

  // Example 3: Promise Pipelining - dependent calls in one round trip!
  const user = stub.createUser("Bob", "bob@example.com");
  // Use user.id before it's resolved - Cap'n Web handles this!
  const todos = stub.getTodos(user.id);

  // Both calls execute in a SINGLE HTTP request
  const [userData, todosData] = await Promise.all([user, todos]);
  console.log("User:", userData);
  console.log("Todos:", todosData);
}

/**
 * For browser usage without a bundler, you can use a simpler approach:
 */
export async function simpleFetchExample() {
  // Helper function for RPC calls
  async function rpc<T>(method: string, ...params: unknown[]): Promise<T> {
    const response = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  // Usage
  const greeting = await rpc<string>("hello", "Alice");
  const sum = await rpc<number>("add", 5, 3);
  const user = await rpc("createUser", "Alice", "alice@example.com");

  console.log({ greeting, sum, user });
}

// For a real app, you'd export the configured stub
export function createRpcClient(baseUrl = "http://localhost:8000/api/rpc") {
  return newHttpBatchRpcSession<ExampleRpcMethods>(baseUrl);
}
