import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinancasCashPosition } from "../src/lib/financas-cash-position.ts";

describe("computeFinancasCashPosition", () => {
  it("usa o lucro dos KPIs sem segundo cálculo", () => {
    const r = computeFinancasCashPosition({
      periodLabel: "1/01 – 19/10/2026",
      netProfit: 62_458.19,
      startingBalance: 2_200,
      manualIn: 0,
      manualOut: 0,
      shopifyPending: 31_030.45,
      currency: "EUR",
    });
    assert.equal(r.netProfit, 62_458.19);
    assert.ok(Math.abs(r.projectedCash - (2_200 + 62_458.19)) < 0.001);
    assert.ok(Math.abs(r.cashOnHand - (r.projectedCash - 31_030.45)) < 0.001);
  });

  it("levantamentos baixam conta+a receber", () => {
    const r = computeFinancasCashPosition({
      periodLabel: "YTD",
      netProfit: 50_000,
      startingBalance: 0,
      manualIn: 0,
      manualOut: 5_000,
      shopifyPending: 10_000,
      currency: "EUR",
    });
    assert.equal(r.projectedCash, 45_000);
    assert.equal(r.cashOnHand, 35_000);
  });
});
