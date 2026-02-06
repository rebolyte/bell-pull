import cron from "node-cron";
import type { Container, CronJob, CronJobRunContext, Plugin } from "./types/index.ts";

export const scheduleCron = (job: CronJob, container: Container) => {
  const { log } = container;

  const schedule = job.schedule ?? "0 0 * * *";

  log.info(`Scheduling cron job`, { name: job.name, schedule });

  cron.getTasks().forEach((task) => {
    if (task.name === job.name) {
      log.info(`Replacing existing task: ${task.name}`);
      task.destroy();
    }
  });

  const task = cron.schedule(
    schedule,
    async () => {
      const ctx: CronJobRunContext = {
        name: job.name,
        schedule,
      };

      await job.run(container, ctx).match(
        (result) => {
          log.info(`${job.name} job completed successfully`, result ?? {});
        },
        (error) => {
          log.error(`Error running ${job.name} job`, { error });
        },
      );
    },
    {
      name: job.name,
      timezone: container.config.TIMEZONE,
    },
  );

  // console.log(`Task: ${JSON.stringify(task, null, 2)}`);
  return task;
};

export const registerPluginCrons = async (
  // deno-lint-ignore no-explicit-any
  plugin: Plugin<any>,
  container: Container,
) => {
  const { log } = container;

  container.log.info(`Registering cron jobs for plugin`, { name: plugin.name });
  const config = await container.plugins
    .getConfig(plugin.name)
    .match(
      (pc) => (pc?.config ?? {}) as Record<string, unknown>,
      () => ({}) as Record<string, unknown>,
    );

  let jobs: CronJob[];
  if (typeof plugin.cronJobs === "function") {
    jobs = plugin.cronJobs(config);
  } else {
    jobs = plugin.cronJobs ?? [];
  }

  jobs.forEach((job) => {
    const scheduleKey = `${job.name}-schedule`;
    if (!(scheduleKey in config)) {
      log.warn(
        `cron: no "${scheduleKey}" in config, using fallback "${job.schedule}"`,
        { job: job.name },
      );
    }
    scheduleCron(job, container);
  });
};
