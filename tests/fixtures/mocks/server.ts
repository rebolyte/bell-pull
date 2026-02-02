import { setupServer } from "msw/node";

let serverInstance: ReturnType<typeof setupServer> | null = null;

const getServer = (handlers: Parameters<ReturnType<typeof setupServer>["use"]> = []) => {
  if (!serverInstance) {
    serverInstance = setupServer(...handlers);
  }
  return serverInstance;
};

export const mswMock = {
  listen: (
    handlers: Parameters<ReturnType<typeof setupServer>["use"]> = [],
    options?: Parameters<ReturnType<typeof setupServer>["listen"]>[0],
  ) => {
    return getServer(handlers).listen(options);
  },
  close: () => {
    if (serverInstance) {
      serverInstance.close();
      serverInstance = null;
    }
  },
  resetHandlers: (...handlers: Parameters<ReturnType<typeof setupServer>["resetHandlers"]>) => {
    return getServer().resetHandlers(...handlers);
  },
  use: (...handlers: Parameters<ReturnType<typeof setupServer>["use"]>) => {
    return getServer().use(...handlers);
  },
};

export const withHandlers = (...handlers: Parameters<typeof mswMock.use>) => {
  mswMock.use(...handlers);
};
