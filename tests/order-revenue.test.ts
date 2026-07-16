import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orderNetRevenue } from "../src/lib/order-revenue.ts";

describe("orderNetRevenue", () => {
  it("subtotal − reembolso", () => {
    assert.equal(
      orderNetRevenue({ subtotal: 100, totalPrice: 110, refunded: 20 }),
      80,
    );
  });

  it("encomenda editada: subtotal original > total actual sem reembolso", () => {
    assert.equal(
      orderNetRevenue({ subtotal: 71.42, totalPrice: 39.95, refunded: 0 }),
      39.95,
    );
  });

  it("fallback para total quando não há subtotal", () => {
    assert.equal(
      orderNetRevenue({ subtotal: 0, totalPrice: 50, refunded: 10 }),
      40,
    );
  });
});
