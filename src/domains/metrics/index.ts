import * as R from "@remeda/remeda";
import { Result, ResultAsync } from "neverthrow";
import { type Metric, type MetricEntry, parseMetric, type TrendSummary } from "./schema.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";

type MetricsDeps = { db: Database; log: Logger };

const record =
  ({ db, log }: MetricsDeps) =>
  (entries: MetricEntry[]): ResultAsync<void, AppError> =>
    ResultAsync.fromPromise(
      (async () => {
        if (R.isEmpty(entries)) return;
        for (const e of entries) {
          await db
            .insertInto("metrics")
            .values({
              date: e.date,
              metric: e.metric,
              value: e.value,
              unit: e.unit ?? null,
              source: e.source,
            })
            .onConflict((oc) =>
              oc.columns(["date", "metric", "source"]).doUpdateSet({
                value: e.value,
                unit: e.unit ?? null,
              })
            )
            .execute();
        }
        log.info`Recorded ${entries.length} metrics`;
      })(),
      dbError("Failed to record metrics"),
    );

const query =
  ({ db }: MetricsDeps) =>
  (
    { metric, from, to, source }: {
      metric?: string;
      from: string;
      to: string;
      source?: string;
    },
  ): ResultAsync<Metric[], AppError> => {
    let q = db
      .selectFrom("metrics")
      .selectAll()
      .where("date", ">=", from)
      .where("date", "<=", to)
      .orderBy("date", "asc");

    if (metric) q = q.where("metric", "=", metric);
    if (source) q = q.where("source", "=", source);

    return ResultAsync.fromPromise(q.execute(), dbError("Failed to query metrics"))
      .andThen((rows) => Result.combine(rows.map(parseMetric)));
  };

const computeStats = (rows: { value: number }[]): { avg: number; total: number; count: number } => {
  if (rows.length === 0) return { avg: 0, total: 0, count: 0 };
  const total = R.sumBy(rows, (r) => r.value);
  return { avg: total / rows.length, total, count: rows.length };
};

const trends =
  ({ db }: MetricsDeps) =>
  (
    { from, to, priorFrom, priorTo }: {
      from: string;
      to: string;
      priorFrom: string;
      priorTo: string;
    },
  ): ResultAsync<TrendSummary[], AppError> =>
    ResultAsync.fromPromise(
      Promise.all([
        db.selectFrom("metrics").selectAll().where("date", ">=", from).where("date", "<=", to)
          .execute(),
        db.selectFrom("metrics").selectAll().where("date", ">=", priorFrom).where(
          "date",
          "<=",
          priorTo,
        ).execute(),
      ]),
      dbError("Failed to fetch metrics for trends"),
    ).map(([currentRows, priorRows]) => {
      const currentByMetric = R.groupBy(currentRows, (r) => r.metric);
      const priorByMetric = R.groupBy(priorRows, (r) => r.metric);
      const allMetrics = [...new Set([...Object.keys(currentByMetric), ...Object.keys(priorByMetric)])];

      return allMetrics.map((metric) => {
        const current = computeStats(currentByMetric[metric] ?? []);
        const prior = computeStats(priorByMetric[metric] ?? []);
        const deltaPercent = prior.avg !== 0
          ? ((current.avg - prior.avg) / prior.avg) * 100
          : null;

        return {
          metric,
          unit: (currentByMetric[metric] ?? priorByMetric[metric])?.[0]?.unit ?? null,
          current,
          prior,
          deltaPercent,
        };
      });
    });

const roundSmart = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);

const formatDelta = (pct: number): string => `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;

const formatTrendsForPrompt = (trendSummaries: TrendSummary[]): string => {
  if (R.isEmpty(trendSummaries)) return "No metrics data available.";

  return trendSummaries
    .map((t) => {
      const avg = roundSmart(t.current.avg);
      const unit = t.unit ? ` ${t.unit}` : "";
      const base = `${t.metric}: avg ${avg}${unit}/day (${t.current.count} days)`;

      if (t.prior.count === 0) return `- ${base}, no prior data`;

      const priorAvg = roundSmart(t.prior.avg);
      const delta = t.deltaPercent !== null ? `, ${formatDelta(t.deltaPercent)}` : "";
      return `- ${base}, prior avg ${priorAvg}${unit}/day${delta}`;
    })
    .join("\n");
};

export const makeMetricsDomain = (deps: MetricsDeps) => ({
  record: record(deps),
  query: query(deps),
  trends: trends(deps),
  formatTrendsForPrompt,
});

export type MetricsDomain = ReturnType<typeof makeMetricsDomain>;
