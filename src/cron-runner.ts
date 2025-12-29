import cron from "node-cron";
import type { Container, CronJob } from "./types/index.ts";

export const scheduleCron = (job: CronJob, container: Container) => {
  const { log } = container;

  log.info(`Scheduling cron job: ${job.name}`);

  cron.getTasks().forEach((task) => {
    if (task.name === job.name) {
      log.info(`Replacing existing task: ${task.name}`);
      task.stop();
    }
  });

  const task = cron.schedule(job.schedule, () =>
    job.run(container).match(
      () => {
        log.info(`${job.name} job completed successfully`);
      },
      (error) => {
        log.error(`Error running ${job.name} job:`, error);
      },
    ), {
    name: job.name,
    timezone: container.config.TIMEZONE,
  });

  // console.log(`Task: ${JSON.stringify(task, null, 2)}`);
  return task;
};
