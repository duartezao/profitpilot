import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcNetProfit } from "../src/lib/profit.ts";

/**
 * Lucro diário = Net Profit dos KPIs.
 * Reembolsos já estão na REV líquida — não se voltam a subtrair
 * (campo `refunds` é informativo / dia de emissão).
 * Portes Shopify cobrados ao cliente são margem extra — não custo.
 */
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
  return calcNetProfit(
    { revenue: a.revenue, cogs: a.cogs, shipping: 0, fees: a.fees },
    adSpend,
  );
}

describe("calcDailyProfit", () => {
  it("não volta a subtrair reembolsos — já estão na revenue líquida", () => {
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
    // 200 − 40 − 5 − 30 = 125 (refunds e portes ignorados no cálculo)
    assert.equal(profit, 125);
  });

  it("dia só com registo de reembolso emitido não altera o lucro (REV=0)", () => {
    const profit = calcDailyProfit({
      revenue: 0,
      cogs: 0,
      shipping: 0,
      fees: 0,
      refunds: 30,
    });
    assert.equal(profit, 0);
  });

  it("portes cobrados não reduzem o lucro (são margem extra)", () => {
    const withoutShip = calcDailyProfit({
      revenue: 100,
      cogs: 20,
      shipping: 0,
      fees: 0,
    });
    const withShip = calcDailyProfit({
      revenue: 100,
      cogs: 20,
      shipping: 15,
      fees: 0,
    });
    assert.equal(withoutShip, 80);
    assert.equal(withShip, 80);
    assert.equal(withShip, withoutShip);
  });
});
