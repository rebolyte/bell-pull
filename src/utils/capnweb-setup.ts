/**
 * Cap'n Web-style RPC Handler
 *
 * Simple JSON-RPC implementation for HTTP transport
 * Following Cap'n Web patterns for method-based RPC dispatch
 */

export interface RpcService {
  [key: string]: (...args: unknown[]) => Promise<unknown>;
}

export interface RpcRequest {
  method: string;
  params?: unknown[];
  id?: string | number;
}

export interface RpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
  id?: string | number;
}

/**
 * Creates an RPC handler that dispatches to service methods
 *
 * Example usage:
 * ```typescript
 * const service = new MyRpcService();
 * const handler = createRpcHandler(service);
 *
 * // Client calls:
 * POST /rpc { "method": "add", "params": [5, 3] }
 * ```
 */
export function createRpcHandler(service: RpcService) {
  return async (request: RpcRequest): Promise<RpcResponse> => {
    const { method, params = [], id } = request;

    // Check if method exists
    if (typeof service[method] !== "function") {
      return {
        error: {
          code: -32601,
          message: `Method '${method}' not found`,
        },
        id,
      };
    }

    try {
      // Call the method with params
      const result = await service[method](...(Array.isArray(params) ? params : [params]));
      return {
        result,
        id,
      };
    } catch (error) {
      return {
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
        id,
      };
    }
  };
}
