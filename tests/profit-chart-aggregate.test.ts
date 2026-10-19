import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateProfitChartByMonth } from "../src/lib/profit-chart-aggregate.ts";
import { resolvePeriodForStore } from "../src/lib/store-timezone.ts";

function dayPoint(
  dateKey: string,
  revenue: number | null,
  profit: number | null,
) {
  return {
    dateKey,
    label: dateKey,
    dateLabel: dateKey,
    revenue,
    profit,
    revenueFmt: revenue != null ? String(revenue) : "—",
    profitFmt: profit != null ? String(profit) : "—",
  };
}

describe("aggregateProfitChartByMonth", () => {
  it("sums daily revenue and profit into monthly totals", () => {
    const points = [
      dayPoint("2026-05-01", 100, 10),
      dayPoint("2026-05-15", 200, 20),
      dayPoint("2026-06-01", 50, 5),
      dayPoint("2026-06-20", 150, 15),
    ];
    const months = aggregateProfitChartByMonth(points);
    assert.equal(months.length, 2);
    assert.equal(months[0]!.dateKey, "2026-05-01");
    assert.equal(months[0]!.revenue, 300);
    assert.equal(months[0]!.profit, 30);
    assert.equal(months[1]!.dateKey, "2026-06-01");
    assert.equal(months[1]!.revenue, 200);
    assert.equal(months[1]!.profit, 20);
  });

  it("keeps true zero months after activity starts", () => {
    const points = [
      dayPoint("2026-05-01", 100, 10),
      dayPoint("2026-05-02", 0, 0),
      dayPoint("2026-06-01", 0, 0),
      dayPoint("2026-07-01", 80, 8),
    ];
    const months = aggregateProfitChartByMonth(points);
    assert.equal(months.length, 3);
    assert.equal(months[1]!.dateKey, "2026-06-01");
    assert.equal(months[1]!.revenue, 0);
    assert.equal(months[1]!.profit, 0);
  });

  it("drops leading months with only null days (pre-import)", () => {
    const points = [
      dayPoint("2026-01-01", null, null),
      dayPoint("2026-02-01", null, null),
      dayPoint("2026-03-01", 100, 10),
      dayPoint("2026-03-15", 50, 5),
    ];
    const months = aggregateProfitChartByMonth(points);
    assert.equal(months.length, 1);
    assert.equal(months[0]!.dateKey, "2026-03-01");
    assert.equal(months[0]!.revenue, 150);
    assert.equal(months[0]!.profit, 15);
  });
});

describe("resolvePeriodForStore long ranges", () => {
  it("omits specificDates for YTD (avoids huge $or on daily chart)", () => {
    const period = resolvePeriodForStore(
      { period: "ytd" },
      "Europe/Lisbon",
      new Date("2026-10-19T12:00:00.000Z"),
    );
    assert.equal(period.startDateKey, "2026-01-01");
    assert.equal(period.endDateKey, "2026-10-19");
    assert.equal(period.specificDates, undefined);
  });

  it("keeps specificDates for short contiguous ranges", () => {
    const period = resolvePeriodForStore(
      { period: "7d" },
      "Europe/Lisbon",
      new Date("2026-10-19T12:00:00.000Z"),
    );
    assert.ok(period.specificDates);
    assert.equal(period.specificDates!.length, 7);
  });

  it("omits specificDates for custom ranges longer than 31 days", () => {
    const period = resolvePeriodForStore(
      { from: "2026-01-01", to: "2026-10-19" },
      "Europe/Lisbon",
    );
    assert.equal(period.specificDates, undefined);
    assert.equal(period.startDateKey, "2026-01-01");
    assert.equal(period.endDateKey, "2026-10-19");
  });
});

describe("aggregateProfitChartByMonth large months", () => {
  it("preserves ~100k monthly totals when summing daily points", () => {
    const points = [];
    for (let d = 1; d <= 30; d++) {
      const day = String(d).padStart(2, "0");
      points.push(dayPoint(`2026-06-${day}`, 3333.33, 500));
    }
    const months = aggregateProfitChartByMonth(points);
    assert.equal(months.length, 1);
    assert.ok(Math.abs((months[0]!.revenue ?? 0) - 99_999.9) < 1);
    assert.ok((months[0]!.revenue ?? 0) > 90_000);
  });
});
