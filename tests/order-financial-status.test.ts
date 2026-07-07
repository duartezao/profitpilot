import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergePaidOrderFilter,
  normalizeOrderFinancialStatus,
  orderCountsTowardProfit,
  orderShouldBeRemoved,
  paidOrderFindFilter,
} from "../src/lib/order-financial-status.ts";

describe("order financial status", () => {
  it("normaliza estado", () => {
    assert.equal(normalizeOrderFinancialStatus(" PAID "), "paid");
  });

  it("só pagas contam para lucro", () => {
    assert.equal(orderCountsTowardProfit("paid"), true);
    assert.equal(orderCountsTowardProfit("partially_paid"), true);
    assert.equal(orderCountsTowardProfit("partially_refunded"), true);
    assert.equal(orderCountsTowardProfit("refunded"), true);
    assert.equal(orderCountsTowardProfit("pending"), false);
    assert.equal(orderCountsTowardProfit("authorized"), false);
  });

  it("expiradas e anuladas saem da BD", () => {
    assert.equal(orderShouldBeRemoved("expired"), true);
    assert.equal(orderShouldBeRemoved("voided"), true);
    assert.equal(orderShouldBeRemoved("pending"), false);
  });

  it("filtro Mongo inclui pagas", () => {
    assert.ok(paidOrderFindFilter().financialStatus.test("paid"));
    assert.ok(paidOrderFindFilter().financialStatus.test("PAID"));
    assert.equal(paidOrderFindFilter().financialStatus.test("pending"), false);
    const merged = mergePaidOrderFilter({ storeId: "abc" });
    assert.equal(merged.storeId, "abc");
    assert.ok(merged.financialStatus);
  });
});
