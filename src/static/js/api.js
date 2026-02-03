import { newHttpBatchRpcSession as createSession } from 'https://cdn.jsdelivr.net/npm/capnweb@0.4.0/+esm';

export { createSession as newHttpBatchRpcSession };

export async function rpc(method, ...params) {
  try {
    const stub = createSession('/api/rpc');
    return await stub[method](...params);
  } catch (error) {
    console.error('RPC error:', error);
    throw error;
  }
}
