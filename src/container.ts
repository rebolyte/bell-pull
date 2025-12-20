import type { Context, Services } from "./types/index.ts";
import { makeMessagesDomain } from "./domains/messages/index.ts";
import { makeMemoryDomain } from "./domains/memory/index.ts";
import { db } from "./services/database.ts";
import { Logger } from "./services/logger.ts";

class EmailService {}
class PaymentGateway {}

export const bootstrap = (svcs: Services): Context => {
  // create object first so domains can reference each other if needed.
  // note the cast here! if we miss adding a domain, it will fail at runtime
  const context = { ...svcs } as Context;

  // we could also just pass entire ctx god object down but this is explicit
  // and domains can't accidentally reference dependencies at runtime
  const { config, db, logger } = svcs;

  // order matters here if domains reference each other
  context.messages = makeMessagesDomain({ config, db, logger });
  context.memory = makeMemoryDomain({ db });

  return context;
};

export const makeContainer = () => {
  const svcs: Services = {
    config: {
      port: 3000,
      host: "0.0.0.0",
      env: "development",
    },
    db,
    logger: new Logger(),
    emailService: new EmailService(),
    paymentGateway: new PaymentGateway(),
  };

  return bootstrap(svcs);
};

export const container = makeContainer();
