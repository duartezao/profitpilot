import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeActiveSpendStreak } from "@/lib/collection-roas";

describe("computeActiveSpendStreak", () => {
  it("conta dias seguidos a partir de hoje", () => {
    const m = new Map([
      ["2026-07-17", 10],
      ["2026-07-16", 5],
      ["2026-07-15", 1],
      ["2026-07-14", 0],
    ]);
    assert.equal(computeActiveSpendStreak(m, "2026-07-17"), 3);
  });

  it("se hoje sem spend, começa em ontem", () => {
    const m = new Map([
      ["2026-07-17", 0],
      ["2026-07-16", 8],
      ["2026-07-15", 2],
    ]);
    assert.equal(computeActiveSpendStreak(m, "2026-07-16"), 2);
    assert.equal(computeActiveSpendStreak(m, "2026-07-17"), 2);
  });

  it("volta a 0 quando há buraco", () => {
    const m = new Map([
      ["2026-07-17", 0],
      ["2026-07-16", 0],
      ["2026-07-15", 20],
    ]);
    assert.equal(computeActiveSpendStreak(m, "2026-07-17"), 0);
  });
});
