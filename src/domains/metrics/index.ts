import * as R from "@remeda/remeda";
import { ok, Result, ResultAsync } from "neverthrow";
import {
  type LLMDeleteMetric,
  LLMDeleteMetricSchema,
  type LLMMetricEntry,
  LLMMetricEntrySchema,
  type Metric,
  type MetricEntry,
  parseMetric,
  type TrendSummary,
} from "./schema.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";
import { extractTag } from "../../utils/string.ts";
import { jsonParsed } from "../../utils/validate.ts";
import { sql } from "kysely";

type MetricsDeps = { db: Database; log: Logger };

const record =
  ({ db, log }: MetricsDeps) => (entries: MetricEntry[]): ResultAsync<void, AppError> =>
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

const query = ({ db }: MetricsDeps) =>
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

const trends = ({ db }: MetricsDeps) =>
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
    const allMetrics = [
      ...new Set([...Object.keys(currentByMetric), ...Object.keys(priorByMetric)]),
    ];

    return allMetrics.map((metric) => {
      const current = computeStats(currentByMetric[metric] ?? []);
      const prior = computeStats(priorByMetric[metric] ?? []);
      const deltaPercent = prior.avg !== 0 ? ((current.avg - prior.avg) / prior.avg) * 100 : null;

      return {
        metric,
        unit: (currentByMetric[metric] ?? priorByMetric[metric])?.[0]?.unit ?? null,
        current,
        prior,
        deltaPercent,
      };
    });
  });

const roundSmart = (n: number): string => Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);

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

const deleteMetrics =
  ({ db, log }: MetricsDeps) => (entries: LLMDeleteMetric[]): ResultAsync<void, AppError> =>
    ResultAsync.fromPromise(
      (async () => {
        if (R.isEmpty(entries)) return;
        for (const e of entries) {
          await db.deleteFrom("metrics")
            .where("metric", "=", e.metric)
            .where("date", "=", e.date)
            .execute();
        }
        log.info`Deleted metrics: ${entries.map((e) => e.metric).join(", ")}`;
      })(),
      dbError("Failed to delete metrics"),
    );

const RecordMetricsSchema = jsonParsed(LLMMetricEntrySchema.array());
const DeleteMetricsSchema = jsonParsed(LLMDeleteMetricSchema.array());

export const METRIC_TAGS = ["recordMetrics", "deleteMetrics"] as const;

export type MetricMessageAnalysis = {
  toRecord: LLMMetricEntry[];
  toDelete: LLMDeleteMetric[];
};

const extractMetrics = ({ log }: MetricsDeps) =>
(
  messageText: string,
): Result<MetricMessageAnalysis, never> => {
  const recordJSON = extractTag("recordMetrics")(messageText ?? "");
  const deleteJSON = extractTag("deleteMetrics")(messageText ?? "");

  const toRecord = recordJSON ? RecordMetricsSchema.safeParse(recordJSON) : null;
  const toDelete = deleteJSON ? DeleteMetricsSchema.safeParse(deleteJSON) : null;

  if (toRecord && !toRecord.success) {
    log.warn`Failed to parse recordMetrics: ${toRecord.error.message}`;
  }
  if (toDelete && !toDelete.success) {
    log.warn`Failed to parse deleteMetrics: ${toDelete.error.message}`;
  }

  return ok({
    toRecord: toRecord?.success ? toRecord.data : [],
    toDelete: toDelete?.success ? toDelete.data : [],
  });
};

export type MetricSummary = { metric: string; count: number };

const topMetrics = ({ db }: MetricsDeps) => (limit = 5): ResultAsync<MetricSummary[], AppError> =>
  ResultAsync.fromPromise(
    db.selectFrom("metrics")
      .select(["metric", sql<number>`count(*)`.as("count")])
      .groupBy("metric")
      .orderBy(sql`count(*)`, "desc")
      .limit(limit)
      .execute() as Promise<MetricSummary[]>,
    dbError("Failed to fetch top metrics"),
  );

const formatTopMetricsForPrompt = (summaries: MetricSummary[]): string | null => {
  if (R.isEmpty(summaries)) return null;
  const lines = summaries.map((s) => `- ${s.metric} (${s.count} entries)`);
  return `Existing tracked metrics:\n${lines.join("\n")}`;
};

export const makeMetricsDomain = (deps: MetricsDeps) => ({
  record: record(deps),
  query: query(deps),
  trends: trends(deps),
  deleteMetrics: deleteMetrics(deps),
  topMetrics: topMetrics(deps),
  extractMetrics: extractMetrics(deps),
  formatTrendsForPrompt,
  formatTopMetricsForPrompt,
});

export type MetricsDomain = ReturnType<typeof makeMetricsDomain>;
