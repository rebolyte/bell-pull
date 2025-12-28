import type { Container, Services } from "./types/index.ts";
import { makeMessagesDomain } from "./domains/messages/index.ts";
import { makeMemoryDomain } from "./domains/memory/index.ts";
import { createDatabase } from "./services/database.ts";
import { makeLogger } from "./services/logger.ts";
import { createConfig } from "./services/config.ts";
import { makeLlm } from "./services/llm.ts";

export const bootstrap = (svcs: Services): Container => {
  // create object first so domains can reference each other if needed.
  // note the cast here! if we miss adding a domain, it will fail at runtime
  const context = { ...svcs } as Container;

  // we could also just pass entire ctx god object down but this is explicit
  // and domains can't accidentally reference dependencies at runtime
  const { config, db, logger } = svcs;

  // order matters here if domains reference each other
  context.messages = makeMessagesDomain({ config, db, logger });
  context.memory = makeMemoryDomain({ db });

  return context;
};

export const makeContainer = (overrides: Partial<Services> = {}) => {
  const config = createConfig(overrides.config);

  const svcs: Services = {
    config,
    db: overrides.db ?? createDatabase(config.DATABASE_PATH),
    logger: overrides.logger ?? makeLogger(),
    llm: overrides.llm ?? makeLlm(config),
  };

  return bootstrap(svcs);
};
