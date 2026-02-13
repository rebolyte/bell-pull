import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { useHarness } from "../../utils/harness.ts";
import { makeMetricsDomain, type MetricsDomain } from "./index.ts";
import { silentLogger } from "../../../tests/fixtures/mocks.ts";

describe("Metrics Domain", () => {
  const harness = useHarness();
  let metrics: MetricsDomain;

  beforeAll(async () => {
    await harness.setup();
  });

  beforeEach(async () => {
    await harness.reset();
    metrics = makeMetricsDomain({ db: harness.db, log: silentLogger });
  });

  afterAll(async () => {
    await harness.teardown();
  });

  describe("record", () => {
    it("inserts metric entries", async () => {
      const result = await metrics.record([
        { date: "2024-06-15", metric: "steps", value: 8500, unit: "count", source: "apple-health" },
        {
          date: "2024-06-15",
          metric: "sleep_hours",
          value: 7.5,
          unit: "hours",
          source: "apple-health",
        },
      ]);

      expect(result.isOk()).toBe(true);

      const rows = await harness.db.selectFrom("metrics").selectAll().execute();
      expect(rows).toHaveLength(2);
      expect(rows[0].metric).toBe("steps");
      expect(rows[0].value).toBe(8500);
      expect(rows[1].metric).toBe("sleep_hours");
      expect(rows[1].value).toBe(7.5);
    });

    it("upserts on conflict (same date/metric/source)", async () => {
      await metrics.record([
        { date: "2024-06-15", metric: "steps", value: 5000, unit: "count", source: "apple-health" },
      ]);
      await metrics.record([
        { date: "2024-06-15", metric: "steps", value: 8500, unit: "count", source: "apple-health" },
      ]);

      const rows = await harness.db.selectFrom("metrics").selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(8500);
    });

    it("handles empty array", async () => {
      const result = await metrics.record([]);
      expect(result.isOk()).toBe(true);
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      await metrics.record([
        { date: "2024-06-10", metric: "steps", value: 7000, unit: "count", source: "apple-health" },
        { date: "2024-06-11", metric: "steps", value: 8000, unit: "count", source: "apple-health" },
        { date: "2024-06-12", metric: "steps", value: 9000, unit: "count", source: "apple-health" },
        {
          date: "2024-06-12",
          metric: "sleep_hours",
          value: 7.5,
          unit: "hours",
          source: "apple-health",
        },
        { date: "2024-06-20", metric: "steps", value: 6000, unit: "count", source: "apple-health" },
      ]);
    });

    it("filters by date range", async () => {
      const result = await metrics.query({ from: "2024-06-10", to: "2024-06-12" });
      const data = result._unsafeUnwrap();
      expect(data).toHaveLength(4);
    });

    it("filters by metric name", async () => {
      const result = await metrics.query({
        metric: "steps",
        from: "2024-06-10",
        to: "2024-06-12",
      });
      const data = result._unsafeUnwrap();
      expect(data).toHaveLength(3);
      expect(data.every((m) => m.metric === "steps")).toBe(true);
    });

    it("filters by source", async () => {
      await metrics.record([
        { date: "2024-06-12", metric: "steps", value: 5000, unit: "count", source: "strava" },
      ]);

      const result = await metrics.query({
        metric: "steps",
        from: "2024-06-12",
        to: "2024-06-12",
        source: "apple-health",
      });
      const data = result._unsafeUnwrap();
      expect(data).toHaveLength(1);
      expect(data[0].source).toBe("apple-health");
    });
  });

  describe("trends", () => {
    it("computes averages and delta between periods", async () => {
      await metrics.record([
        { date: "2024-06-01", metric: "steps", value: 7000, unit: "count", source: "apple-health" },
        { date: "2024-06-02", metric: "steps", value: 8000, unit: "count", source: "apple-health" },
        { date: "2024-06-08", metric: "steps", value: 9000, unit: "count", source: "apple-health" },
        {
          date: "2024-06-09",
          metric: "steps",
          value: 10000,
          unit: "count",
          source: "apple-health",
        },
      ]);

      const result = await metrics.trends({
        from: "2024-06-08",
        to: "2024-06-14",
        priorFrom: "2024-06-01",
        priorTo: "2024-06-07",
      });

      const data = result._unsafeUnwrap();
      expect(data).toHaveLength(1);
      expect(data[0].metric).toBe("steps");
      expect(data[0].current.avg).toBe(9500);
      expect(data[0].prior.avg).toBe(7500);
      expect(data[0].deltaPercent).toBeCloseTo(26.67, 1);
    });

    it("returns null delta when no prior data", async () => {
      await metrics.record([
        { date: "2024-06-08", metric: "steps", value: 9000, unit: "count", source: "apple-health" },
      ]);

      const result = await metrics.trends({
        from: "2024-06-08",
        to: "2024-06-14",
        priorFrom: "2024-06-01",
        priorTo: "2024-06-07",
      });

      const data = result._unsafeUnwrap();
      expect(data[0].deltaPercent).toBeNull();
      expect(data[0].prior.count).toBe(0);
    });

    it("returns empty array when no metrics exist", async () => {
      const result = await metrics.trends({
        from: "2024-06-08",
        to: "2024-06-14",
        priorFrom: "2024-06-01",
        priorTo: "2024-06-07",
      });

      expect(result._unsafeUnwrap()).toEqual([]);
    });
  });

  describe("formatTrendsForPrompt", () => {
    it("formats trend summaries", () => {
      const result = metrics.formatTrendsForPrompt([
        {
          metric: "steps",
          unit: "count",
          current: { avg: 8500, total: 59500, count: 7 },
          prior: { avg: 7500, total: 52500, count: 7 },
          deltaPercent: 13.33,
        },
      ]);

      expect(result).toContain("steps:");
      expect(result).toContain("avg 8,500 count/day");
      expect(result).toContain("prior avg 7,500 count/day");
      expect(result).toContain("+13.3%");
    });

    it("handles no prior data", () => {
      const result = metrics.formatTrendsForPrompt([
        {
          metric: "weight",
          unit: "lbs",
          current: { avg: 175, total: 175, count: 1 },
          prior: { avg: 0, total: 0, count: 0 },
          deltaPercent: null,
        },
      ]);

      expect(result).toContain("no prior data");
    });

    it("returns fallback for empty trends", () => {
      expect(metrics.formatTrendsForPrompt([])).toBe("No metrics data available.");
    });
  });

  describe("extractMetrics", () => {
    it("extracts recordMetrics tag", () => {
      const text =
        `Noted.\n<recordMetrics>[{"metric":"mood","value":8,"unit":"score"}]</recordMetrics>`;
      const result = metrics.extractMetrics(text)._unsafeUnwrap();
      expect(result.toRecord).toEqual([{ metric: "mood", value: 8, unit: "score" }]);
      expect(result.toDelete).toEqual([]);
    });

    it("extracts deleteMetrics tag", () => {
      const text =
        `Done.\n<deleteMetrics>[{"metric":"weight","date":"2024-06-15"}]</deleteMetrics>`;
      const result = metrics.extractMetrics(text)._unsafeUnwrap();
      expect(result.toRecord).toEqual([]);
      expect(result.toDelete).toEqual([{ metric: "weight", date: "2024-06-15" }]);
    });

    it("extracts both tags from same response", () => {
      const text =
        `Updated.\n<recordMetrics>[{"metric":"mood","value":7}]</recordMetrics>\n<deleteMetrics>[{"metric":"old_metric","date":"2024-06-15"}]</deleteMetrics>`;
      const result = metrics.extractMetrics(text)._unsafeUnwrap();
      expect(result.toRecord).toHaveLength(1);
      expect(result.toDelete).toHaveLength(1);
    });

    it("returns empty arrays when no tags present", () => {
      const result = metrics.extractMetrics("Just a normal response.")._unsafeUnwrap();
      expect(result.toRecord).toEqual([]);
      expect(result.toDelete).toEqual([]);
    });
  });

  describe("deleteMetrics", () => {
    it("deletes by metric name and date", async () => {
      await metrics.record([
        { date: "2024-06-15", metric: "mood", value: 8, unit: "score", source: "conversation" },
        { date: "2024-06-16", metric: "mood", value: 7, unit: "score", source: "conversation" },
      ]);

      await metrics.deleteMetrics([{ metric: "mood", date: "2024-06-15" }]);

      const rows = await harness.db.selectFrom("metrics").selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].date).toBe("2024-06-16");
    });

    it("only deletes matching date, not all entries", async () => {
      await metrics.record([
        { date: "2024-06-15", metric: "mood", value: 8, unit: "score", source: "conversation" },
        { date: "2024-06-16", metric: "mood", value: 7, unit: "score", source: "conversation" },
      ]);

      await metrics.deleteMetrics([{ metric: "mood", date: "2024-06-16" }]);

      const rows = await harness.db.selectFrom("metrics").selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].date).toBe("2024-06-15");
    });

    it("handles empty array", async () => {
      const result = await metrics.deleteMetrics([]);
      expect(result.isOk()).toBe(true);
    });
  });
});
