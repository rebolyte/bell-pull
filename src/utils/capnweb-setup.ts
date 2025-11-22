/**
 * Cap'n Web Setup and Utilities
 *
 * This module provides utilities for setting up Cap'n Web RPC
 *
 * Note: To use capnweb, you need to import from the GitHub repository:
 * import { RpcTarget, newWorkersRpcResponse, newWebSocketRpcSession } from "capnweb";
 *
 * Example Server (for Cloudflare Workers or similar):
 * ```typescript
 * import { RpcTarget, newWorkersRpcResponse } from "capnweb";
 *
 * class MyApi extends RpcTarget {
 *   hello(name: string) {
 *     return `Hello, ${name}!`;
 *   }
 * }
 *
 * export default {
 *   fetch(request: Request) {
 *     return newWorkersRpcResponse(request, new MyApi());
 *   }
 * };
 * ```
 *
 * Example Client:
 * ```typescript
 * import { newWebSocketRpcSession } from "capnweb";
 *
 * const api = newWebSocketRpcSession("wss://example.com/api");
 * const result = await api.hello("World");
 * ```
 */

export interface RpcService {
  [key: string]: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Mock RPC handler for demonstration
 * In production, you would use capnweb's RpcTarget and transport methods
 */
export async function handleRpcCall(
  service: RpcService,
  method: string,
  args: unknown[],
): Promise<unknown> {
  if (typeof service[method] !== "function") {
    throw new Error(`Method ${method} not found`);
  }

  return await service[method](...args);
}

/**
 * Creates a simple RPC request handler
 */
export function createRpcHandler(service: RpcService) {
  return async (body: { method: string; args: unknown[] }) => {
    const { method, args = [] } = body;

    try {
      const result = await handleRpcCall(service, method, args);
      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };
}
