import { Result, ResultAsync } from "neverthrow";
import {
  type CronLogEntry,
  type CronLogRow,
  parseCronLogRow,
} from "./schema.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";

type CronLogDeps = { db: Database; log: Logger };

const write =
  ({ db }: CronLogDeps) =>
  (entry: CronLogEntry): ResultAsync<void, AppError> =>
    ResultAsync.fromPromise(
      db.insertInto("cronLog")
        .values({
          jobName: entry.jobName,
          state: entry.state,
          result: entry.result ?? null,
          error: entry.error ?? null,
          durationMs: entry.durationMs ?? null,
        })
        .execute(),
      dbError("Failed to write cron log"),
    ).map(() => {});

const query =
  ({ db }: CronLogDeps) =>
  (jobName?: string, limit = 50): ResultAsync<CronLogRow[], AppError> => {
    let q = db.selectFrom("cronLog").selectAll().orderBy("createdAt", "desc").limit(limit);
    if (jobName) q = q.where("jobName", "=", jobName);
    return ResultAsync.fromPromise(
      q.execute(),
      dbError("Failed to query cron log"),
    ).andThen((rows) => Result.combine(rows.map(parseCronLogRow)));
  };

export const makeCronLogDomain = (deps: CronLogDeps) => ({
  write: write(deps),
  query: query(deps),
});

export type CronLogDomain = ReturnType<typeof makeCronLogDomain>;
