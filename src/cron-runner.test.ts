import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import cron from "node-cron";
import { ResultAsync } from "neverthrow";
import { registerPluginCrons, scheduleCron } from "./cron-runner.ts";
import { createTestDb } from "./utils/harness.ts";
import { bootstrap } from "./container.ts";
import type { Container, CronJob, Plugin } from "./types/index.ts";
import type { Database } from "./services/database.ts";
import { silentLogger } from "../tests/fixtures/mocks.ts";
import { createConfig } from "./services/config.ts";
import { makeLlmService } from "./services/llm.ts";

const makeFakeJob = (name: string, schedule = "0 9 * * *"): CronJob => ({
  name,
  schedule,
  run: () => ResultAsync.fromSafePromise(Promise.resolve(null)),
});

const makeFakePlugin = (
  overrides: Partial<Plugin<Record<string, unknown>>> = {},
): Plugin<Record<string, unknown>> => ({
  name: "test-plugin",
  cronJobs: [makeFakeJob("test-job")],
  ...overrides,
});

const destroyAllTasks = () => {
  cron.getTasks().forEach((t) => t.destroy());
};

const makeTestContainer = (db: Database): Container => {
  const config = createConfig({
    TELEGRAM_BOT_TOKEN: "t",
    TELEGRAM_CHAT_ID: "t",
    ANTHROPIC_API_KEY: "t",
  });
  return bootstrap({
    config,
    db,
    log: silentLogger,
    llm: makeLlmService(config, silentLogger),
  });
};

const getCronExpression = (task: unknown): string =>
  (task as { cronExpression: string }).cronExpression;

describe("cron-runner", () => {
  let db: Database;
  let container: Container;

  beforeAll(async () => {
    db = await createTestDb();
    container = makeTestContainer(db);
  });

  afterEach(destroyAllTasks);
  afterAll(async () => await db.destroy());

  describe("scheduleCron", () => {
    it("replaces existing task with same name", () => {
      scheduleCron(makeFakeJob("dedup-job", "0 9 * * *"), container);
      scheduleCron(makeFakeJob("dedup-job", "0 7 * * *"), container);

      const tasks = [...cron.getTasks().values()];
      const matching = tasks.filter((t) => t.name === "dedup-job");
      expect(matching).toHaveLength(1);
      expect(getCronExpression(matching[0])).toBe("0 7 * * *");
    });
  });

  describe("registerPluginCrons", () => {
    it("reads config from DB and schedules jobs", async () => {
      const plugin = makeFakePlugin({
        cronJobs: (config: Record<string, unknown>) => [
          makeFakeJob("dynamic-job", (config["dynamic-job-schedule"] as string) ?? "0 12 * * *"),
        ],
      });

      await registerPluginCrons(plugin, container);

      const tasks = [...cron.getTasks().values()];
      const matching = tasks.filter((t) => t.name === "dynamic-job");
      expect(matching).toHaveLength(1);
      expect(getCronExpression(matching[0])).toBe("0 12 * * *");
    });

    it("updates cron schedule when config changes", async () => {
      const plugin = makeFakePlugin({
        name: "schedule-plugin",
        cronJobs: (config: Record<string, unknown>) => [
          makeFakeJob("briefing", (config["briefing-schedule"] as string) ?? "0 9 * * *"),
        ],
      });

      await registerPluginCrons(plugin, container);
      const before = [...cron.getTasks().values()].find((t) => t.name === "briefing");
      expect(getCronExpression(before)).toBe("0 9 * * *");

      await container.plugins.setConfig("schedule-plugin", {
        "briefing-schedule": "0 7 * * *",
      });
      await registerPluginCrons(plugin, container);

      const after = [...cron.getTasks().values()].find((t) => t.name === "briefing");
      expect(getCronExpression(after)).toBe("0 7 * * *");
    });
  });

  describe("setPluginConfig RPC triggers reregistration", () => {
    it("updates cron schedule via RPC", async () => {
      const plugin = makeFakePlugin({
        name: "rpc-plugin",
        cronJobs: (config: Record<string, unknown>) => [
          makeFakeJob("rpc-job", (config["rpc-job-schedule"] as string) ?? "0 9 * * *"),
        ],
      });

      await registerPluginCrons(plugin, container);

      const { PluginsRpcService } = await import("./services/plugins-rpc.ts");
      // deno-lint-ignore no-explicit-any
      const rpc = new PluginsRpcService(container, [plugin as Plugin<any>]);
      const result = await rpc.setPluginConfig("rpc-plugin", {
        "rpc-job-schedule": "30 6 * * *",
      });
      expect(result.success).toBe(true);

      const task = [...cron.getTasks().values()].find((t) => t.name === "rpc-job");
      expect(getCronExpression(task)).toBe("30 6 * * *");
    });
  });
});
