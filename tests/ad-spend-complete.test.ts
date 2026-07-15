import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAdDayClosedAfterMidnight,
  isApiSpendDayClosed,
  yesterdayDateKey,
} from "../src/lib/ad-spend-complete.ts";

describe("ad-spend-complete", () => {
  it("yesterdayDateKey", () => {
    assert.equal(yesterdayDateKey("2026-07-14"), "2026-07-13");
  });

  it("sync no mesmo dia civil = parcial (não fechado)", () => {
    const closed = isAdDayClosedAfterMidnight(
      "2026-07-13",
      "2026-07-13T21:43:00.000Z",
      "Europe/Brussels",
      "2026-07-14",
    );
    assert.equal(closed, false);
  });

  it("sync no dia seguinte = fechado", () => {
    const closed = isAdDayClosedAfterMidnight(
      "2026-07-13",
      "2026-07-14T08:30:00.000Z",
      "Europe/Brussels",
      "2026-07-15",
    );
    assert.equal(closed, true);
  });

  it("API com amount 0 nunca fechado", () => {
    assert.equal(
      isApiSpendDayClosed(
        {
          dateKey: "2026-07-13",
          source: "api",
          amount: 0,
          updatedAt: "2026-07-14T10:00:00.000Z",
        },
        "2026-07-15",
        "Europe/Brussels",
      ),
      false,
    );
  });
});
