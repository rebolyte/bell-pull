import { makeServer, ServerOptions } from "./server.ts";
import { makeContainer } from "./container.ts";
import { Container } from "./types/index.ts";

export interface RunOptions extends ServerOptions {
  port?: number;
  container?: Container;
  signal?: AbortSignal;
}

export const run = (opts: RunOptions = {}) => {
  const container = opts.container ?? makeContainer();
  const server = makeServer(container, opts);

  return Deno.serve({
    port: opts.port !== undefined ? opts.port : container.config.PORT,
    signal: opts.signal,
    onListen: ({ port, hostname }) => {
      console.log(`listening on http://${hostname}:${port}`);
    },
  }, server.fetch);
};

if (import.meta.main) {
  run();
}
