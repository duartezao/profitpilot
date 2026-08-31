import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeDailyAggWithRefundIssuance } from "../src/lib/order-refunds.ts";

describe("mergeDailyAggWithRefundIssuance", () => {
  it("subtrai reembolsos emitidos do lucro do dia sem alterar REV", () => {
    const orders = new Map([
      [
        "2026-08-15",
        {
          revenue: 200,
          cogs: 40,
          shipping: 0,
          fees: 0,
          refunds: 50,
          orders: 2,
        },
      ],
    ]);
    const refunds = new Map([["2026-08-15", 50]]);

    const merged = mergeDailyAggWithRefundIssuance(orders, refunds);
    assert.equal(merged.get("2026-08-15")?.revenue, 200);
    assert.equal(merged.get("2026-08-15")?.refunds, 50);
  });

  it("cria dia só com reembolso informativo quando não há vendas nesse dia", () => {
    const orders = new Map<string, ReturnType<typeof base>>();
    const refunds = new Map([["2026-08-20", 30]]);

    const merged = mergeDailyAggWithRefundIssuance(orders, refunds);
    assert.equal(merged.get("2026-08-20")?.revenue, 0);
    assert.equal(merged.get("2026-08-20")?.refunds, 30);
  });
});

function base() {
  return {
    revenue: 0,
    cogs: 0,
    shipping: 0,
    fees: 0,
    refunds: 0,
    orders: 0,
  };
}
