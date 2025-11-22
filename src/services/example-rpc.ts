// Example RPC service using capnweb
// Note: capnweb uses RpcTarget for creating RPC services

export class ExampleRpcService {
  async hello(name: string): Promise<string> {
    return `Hello, ${name}! This is a Cap'n Web RPC response.`;
  }

  async add(a: number, b: number): Promise<number> {
    return a + b;
  }

  async getUserInfo(userId: string): Promise<{ id: string; name: string; email: string }> {
    // Simulate database lookup
    return {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
    };
  }

  async processBatch(items: string[]): Promise<{ processed: number; results: string[] }> {
    const results = items.map((item) => item.toUpperCase());
    return {
      processed: items.length,
      results,
    };
  }
}
