import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  orderCountsTowardEuCustomsFee,
  shouldRevertUnshippedProductCogs,
} from "@/lib/order-fulfillment-status";

describe("order-cogs — dia conta, sync reverte canceladas", () => {
  it("fulfilled = já enviada (não reverter COGS/taxa no sync)", () => {
    assert.equal(orderCountsTowardEuCustomsFee("fulfilled"), true);
    assert.equal(orderCountsTowardEuCustomsFee("unfulfilled"), false);
  });

  it("não reverte se já foi enviada", () => {
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "fulfilled",
        financialStatus: "refunded",
        cancelledAt: "2026-07-15T10:00:00Z",
      }),
      false,
    );
  });

  it("reverte COGS se cancelada sem envio", () => {
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "paid",
        cancelledAt: "2026-07-15T10:00:00Z",
      }),
      true,
    );
  });

  it("reverte COGS se reembolsada total sem envio", () => {
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "refunded",
        cancelledAt: null,
      }),
      true,
    );
  });

  it("não reverte enquanto paga e por processar (conta no dia para o coach)", () => {
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "paid",
        cancelledAt: null,
      }),
      false,
    );
  });

  it("taxa UE segue a mesma regra de reversão no sync", () => {
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "refunded",
      }),
      true,
    );
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "fulfilled",
        financialStatus: "refunded",
      }),
      false,
    );
  });
});
