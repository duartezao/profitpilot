import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateSnapsByDate,
  fullyCoveredHistKeys,
  sumDayAggs,
  type DailyMetricSnap,
} from "../src/lib/daily-metrics-read.ts";

function snap(
  dateKey: string,
  storeId: string,
  revenue: number,
  netProfit: number,
): DailyMetricSnap {
  return {
    dateKey,
    storeId,
    revenue,
    orders: 1,
    cogs: 0,
    shipping: 0,
    fees: 0,
    refunds: 0,
    chargebacks: 0,
    adSpend: 0,
    operatingExpenses: 0,
    netProfit,
    sessions: null,
    atcPct: null,
    cvrPct: null,
  };
}

describe("daily-metrics-read", () => {
  it("aggregates snaps by date across stores", () => {
    const byDate = aggregateSnapsByDate([
      snap("2026-06-01", "a", 100, 10),
      snap("2026-06-01", "b", 50, 5),
      snap("2026-06-02", "a", 20, 2),
    ]);
    assert.equal(byDate.get("2026-06-01")!.revenue, 150);
    assert.equal(byDate.get("2026-06-01")!.storeCount, 2);
    assert.equal(byDate.get("2026-06-02")!.storeCount, 1);
  });

  it("marks days fully covered only when all stores have snaps", () => {
    const byDate = aggregateSnapsByDate([
      snap("2026-06-01", "a", 100, 10),
      snap("2026-06-01", "b", 50, 5),
      snap("2026-06-02", "a", 20, 2),
    ]);
    const { covered, missing } = fullyCoveredHistKeys(
      byDate,
      ["2026-06-01", "2026-06-02", "2026-06-03"],
      2,
    );
    assert.deepEqual(covered, ["2026-06-01"]);
    assert.deepEqual(missing, ["2026-06-02", "2026-06-03"]);
  });

  it("sums covered day aggs for KPI rollup", () => {
    const byDate = aggregateSnapsByDate([
      snap("2026-06-01", "a", 100, 10),
      snap("2026-06-02", "a", 200, 20),
    ]);
    const sum = sumDayAggs(byDate, ["2026-06-01", "2026-06-02"]);
    assert.equal(sum.revenue, 300);
    assert.equal(sum.netProfit, 30);
  });
});
