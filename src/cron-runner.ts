import cron from "node-cron";
import type { Container, CronJob, CronJobRunContext } from "./types/index.ts";

export const scheduleCron = (job: CronJob, container: Container) => {
  const { log } = container;

  log.info(`Scheduling cron job`, { name: job.name });

  cron.getTasks().forEach((task) => {
    if (task.name === job.name) {
      log.info(`Replacing existing task: ${task.name}`);
      task.destroy();
    }
  });

  const schedule = job.schedule ?? "0 0 * * *";
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
