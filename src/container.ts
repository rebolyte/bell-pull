import type { Container, Services } from "./types/index.ts";
import { makeMessagesDomain } from "./domains/messages/index.ts";
import { makeMemoryDomain } from "./domains/memory/index.ts";
import { createDatabase } from "./services/database.ts";
import { makeLogger } from "./services/logger.ts";
import { type AppConfig, createConfig } from "./services/config.ts";
import { makeLlmService } from "./services/llm.ts";

export const bootstrap = (svcs: Services): Container => {
  // create object first so domains can reference each other if needed.
  // note the cast here! if we miss adding a domain, it will fail at runtime
  const context = { ...svcs } as Container;

  // we could also just pass entire ctx god object down but this is explicit
  // and domains can't accidentally reference dependencies at runtime
  const { config, db, log } = svcs;

  // order matters here if domains reference each other
  context.messages = makeMessagesDomain({ config, db, log });
  context.memory = makeMemoryDomain({ config, db });

  return context;
};

export const makeContainer = async (
  overrides?: Omit<Partial<Services>, "config"> & { config?: Partial<AppConfig> },
) => {
  const config = createConfig(overrides?.config);

  const svcs: Services = {
    config,
    db: overrides?.db ?? createDatabase(config.DATABASE_PATH),
    log: overrides?.log ?? await makeLogger(config),
    llm: overrides?.llm ?? makeLlmService(config),
  };

  return bootstrap(svcs);
};
