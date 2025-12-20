import { makeServer, ServerOptions } from "./server.ts";
import { makeContainer } from "./container.ts";
import { Context } from "./types/index.ts";

export interface RunOptions extends ServerOptions {
  port?: number;
  container?: Context;
  signal?: AbortSignal;
}

export const run = (opts: RunOptions = {}) => {
  const container = opts.container || makeContainer();
  const server = makeServer(container, opts);

  return Deno.serve({
    port: opts.port || container.config.PORT,
    signal: opts.signal,
    onListen: ({ port, hostname }) => {
      console.log(`listening on http://${hostname}:${port}`);
    },
  }, server.fetch);
};

if (import.meta.main) {
  console.log("I AM MAIN");
  run();
}
