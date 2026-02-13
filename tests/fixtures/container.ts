import type { Context, Filter } from "grammy";
import { createTestDb } from "../../src/utils/harness.ts";
import { bootstrap } from "../../src/container.ts";
import type { Container, Services } from "../../src/types/index.ts";
import type { Database } from "../../src/services/database.ts";
import type { AppConfig } from "../../src/services/config.ts";
import { makeLlmService } from "../../src/services/llm.ts";
import type { BotDeps } from "../../src/plugins/telegram/index.ts";
import { withRetry } from "../../src/utils/retry.ts";
import { testConfig } from "./config.ts";
import {
  createMockAnthropic,
  createMockGrammyContext,
  createMockTelegramApi,
  type MockAnthropicOptions,
  type MockGrammyContextOptions,
  type MockTelegramApi,
  type MockTelegramApiOptions,
  silentLogger,
} from "./mocks.ts";

export type TestContainerOptions = {
  config?: Partial<AppConfig>;
  db?: Database;
  anthropic?: MockAnthropicOptions;
  telegram?: MockTelegramApiOptions;
};

export type TestHarness = {
  container: Container;
  mockAnthropic: ReturnType<typeof createMockAnthropic>;
  mockApi: MockTelegramApi;
  deps: BotDeps;
  createCtx: (opts?: MockGrammyContextOptions) => Filter<Context, "message">;
  cleanup: () => Promise<void>;
};

export const createTestHarness = async (
  opts: TestContainerOptions = {},
): Promise<TestHarness> => {
  const db = opts.db ?? await createTestDb();
  const config = { ...testConfig, ...opts.config };
  const mockAnthropic = createMockAnthropic(opts.anthropic);
  const mockApi = createMockTelegramApi(opts.telegram);

  const services: Services = {
    config,
    db,
    log: silentLogger,
    llm: makeLlmService(config, silentLogger, {
      anthropic: mockAnthropic.client,
    }),
  };

  const container = bootstrap(services);

  const fastRetry = withRetry({ attempts: 3, delayMs: 10 });

  const deps: BotDeps = {
    config: container.config,
    log: container.log,
    llm: container.llm,
    memory: container.memory,
    metrics: container.metrics,
    messages: container.messages,
    plugins: container.plugins,
    retry: fastRetry,
  };

  return {
    container,
    mockAnthropic,
    mockApi,
    deps,
    createCtx: (ctxOpts) =>
      createMockGrammyContext(mockApi, ctxOpts) as unknown as Filter<Context, "message">,
    cleanup: () => db.destroy(),
  };
};
