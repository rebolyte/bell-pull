import type Anthropic from "@anthropic-ai/sdk";
import { createTestDb } from "../../src/utils/harness.ts";
import { bootstrap, type Services } from "../../src/container.ts";
import type { Container } from "../../src/types/index.ts";
import type { Database } from "../../src/services/database.ts";
import type { AppConfig } from "../../src/services/config.ts";
import { makeLlmService } from "../../src/services/llm.ts";
import { testConfig } from "./config.ts";
import { createMockAnthropic, silentLogger, type MockAnthropicOptions } from "./mocks.ts";

export type TestContainerOptions = {
  config?: Partial<AppConfig>;
  db?: Database;
  anthropic?: MockAnthropicOptions;
};

export type TestContainer = {
  container: Container;
  mockAnthropic: ReturnType<typeof createMockAnthropic>;
  cleanup: () => Promise<void>;
};

export const createTestContainer = async (
  opts: TestContainerOptions = {},
): Promise<TestContainer> => {
  const db = opts.db ?? await createTestDb();
  const config = { ...testConfig, ...opts.config };
  const mockAnthropic = createMockAnthropic(opts.anthropic);

  const services: Services = {
    config,
    db,
    log: silentLogger,
    llm: makeLlmService(config, { anthropic: mockAnthropic.client }),
  };

  const container = bootstrap(services);

  return {
    container,
    mockAnthropic,
    cleanup: async () => {
      await db.destroy();
    },
  };
};
