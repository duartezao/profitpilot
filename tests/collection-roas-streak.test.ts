import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeActiveSpendStreak } from "@/lib/collection-roas";

describe("computeActiveSpendStreak (dias a correr)", () => {
  it("conta desde o 1.º spend até à referência", () => {
    const m = new Map([
      ["2026-07-17", 10],
      ["2026-07-16", 5],
      ["2026-07-15", 1],
      ["2026-07-14", 0],
      ["2026-07-13", 4],
    ]);
    // Activo em 17; 1.º spend no lookback = 13 → 5 dias (13..17)
    assert.equal(computeActiveSpendStreak(m, "2026-07-17"), 5);
  });

  it("se referência sem spend, usa o dia anterior", () => {
    const m = new Map([
      ["2026-07-17", 0],
      ["2026-07-16", 8],
      ["2026-07-15", 2],
    ]);
    assert.equal(computeActiveSpendStreak(m, "2026-07-16"), 2);
    assert.equal(computeActiveSpendStreak(m, "2026-07-17"), 2);
  });

  it("volta a 0 quando referência e dia anterior sem spend", () => {
    const m = new Map([
      ["2026-07-17", 0],
      ["2026-07-16", 0],
      ["2026-07-15", 20],
    ]);
    assert.equal(computeActiveSpendStreak(m, "2026-07-17"), 0);
  });

  it("pausas a meio não reiniciam (só o estado actual)", () => {
    const m = new Map([
      ["2026-10-01", 10],
      ["2026-09-30", 10],
      ["2026-09-29", 10],
      ["2026-09-28", 10],
      ["2026-09-27", 10],
      ["2026-09-26", 10],
      ["2026-09-25", 0],
      ["2026-09-24", 0],
      ["2026-09-23", 0],
      ["2026-09-22", 5],
      ["2026-09-21", 5],
      ["2026-09-20", 5],
    ]);
    // 1.º spend 20 → 1 Out = 12 dias
    assert.equal(computeActiveSpendStreak(m, "2026-10-01"), 12);
  });
});
