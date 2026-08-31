import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcNetProfit } from "../src/lib/profit.ts";

/** Espelha calcDailyProfit em metrics.ts */
function calcDailyProfit(
  a: {
    revenue: number;
    cogs: number;
    shipping: number;
    fees: number;
    refunds?: number;
  },
  adSpend = 0,
) {
  return calcNetProfit(a, adSpend) - (a.refunds ?? 0);
}

describe("calcDailyProfit", () => {
  it("subtrai reembolsos emitidos no dia ao lucro", () => {
    const profit = calcDailyProfit(
      {
        revenue: 200,
        cogs: 40,
        shipping: 10,
        fees: 5,
        refunds: 50,
      },
      30,
    );
    assert.equal(profit, 65);
  });

  it("dia só com reembolso fica com lucro negativo", () => {
    const profit = calcDailyProfit({
      revenue: 0,
      cogs: 0,
      shipping: 0,
      fees: 0,
      refunds: 30,
    });
    assert.equal(profit, -30);
  });
});
