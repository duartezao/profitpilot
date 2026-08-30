import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMonthAxisLabel,
  monthAxisTickLabel,
  monthStartTicksFromDateKeys,
  resolveChartAxisGranularity,
} from "../src/lib/period.ts";

describe("resolveChartAxisGranularity", () => {
  it("uses day labels for short periods", () => {
    assert.equal(resolveChartAxisGranularity(30), "day");
    assert.equal(resolveChartAxisGranularity(44), "day");
  });

  it("uses month labels for long periods", () => {
    assert.equal(resolveChartAxisGranularity(45), "month");
    assert.equal(resolveChartAxisGranularity(90), "month");
    assert.equal(resolveChartAxisGranularity(365), "month");
  });
});

describe("month axis ticks", () => {
  it("formats month abbreviations in pt", () => {
    assert.equal(formatMonthAxisLabel("2026-01-15"), "jan");
    assert.equal(formatMonthAxisLabel("2026-08-01"), "ago");
  });

  it("picks first day of each month", () => {
    assert.deepEqual(
      monthStartTicksFromDateKeys([
        "2026-01-05",
        "2026-01-20",
        "2026-02-01",
        "2026-02-14",
      ]),
      ["2026-01-05", "2026-02-01"],
    );
  });

  it("adds year suffix when crossing years", () => {
    assert.equal(monthAxisTickLabel("2026-01-03", "2025-12-28"), "jan '26");
    assert.equal(monthAxisTickLabel("2026-02-01", "2026-01-05"), "fev");
  });
});
