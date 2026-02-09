import { makeServers, ServerOptions } from "./server.ts";
import { makeContainer } from "./container.ts";
import { Container } from "./types/index.ts";

export interface RunOptions extends ServerOptions {
  publicPort?: number;
  adminPort?: number;
  container?: Container;
  signal?: AbortSignal;
}

export type RunResult = {
  public: Deno.HttpServer;
  admin: Deno.HttpServer;
};

export const run = async (opts: RunOptions = {}): Promise<RunResult> => {
  const container = opts.container ?? await makeContainer();
  const apps = await makeServers(container, opts);

  const { log, config } = container;

  const publicServer = Deno.serve({
    port: opts.publicPort ?? config.PUBLIC_PORT,
    signal: opts.signal,
    onListen: ({ port, hostname }) => {
      log.info(`public server listening on http://${hostname}:${port}`);
    },
  }, apps.public.fetch);

  const adminServer = Deno.serve({
    port: opts.adminPort ?? config.ADMIN_PORT,
    signal: opts.signal,
    onListen: ({ port, hostname }) => {
      log.info(`admin server listening on http://${hostname}:${port}`);
    },
  }, apps.admin.fetch);

  return { public: publicServer, admin: adminServer };
};

if (import.meta.main) {
  run();
}
