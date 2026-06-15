import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateOrderFeesFromBalanceTx,
  shouldIncludeBalanceTxForOrderFees,
  type BalanceTxFeeNode,
} from "../src/lib/order-fees-aggregate.ts";

function node(
  partial: Partial<BalanceTxFeeNode> & Pick<BalanceTxFeeNode, "associatedOrderId">,
): BalanceTxFeeNode {
  return {
    feeAmount: 1.5,
    feeCurrency: "EUR",
    transactionDate: new Date("2026-06-01"),
    test: false,
    type: "CHARGE",
    ...partial,
  };
}

describe("order fees from Shopify balance transactions", () => {
  it("soma taxas por encomenda e ignora transferências", () => {
    const nodes = [
      node({
        associatedOrderId: "gid://shopify/Order/1",
        feeAmount: 2.5,
      }),
      node({
        associatedOrderId: "gid://shopify/Order/1",
        feeAmount: -0.5,
        type: "REFUND",
      }),
      node({
        associatedOrderId: null,
        type: "TRANSFER",
      }),
      node({
        associatedOrderId: "gid://shopify/Order/2",
        feeAmount: 1.2,
      }),
    ];

    const map = aggregateOrderFeesFromBalanceTx(nodes);
    assert.equal(map.get("gid://shopify/Order/1"), 2);
    assert.equal(map.get("gid://shopify/Order/2"), 1.2);
    assert.equal(map.size, 2);
  });

  it("exclui transações de teste e payout", () => {
    assert.equal(
      shouldIncludeBalanceTxForOrderFees(
        node({ associatedOrderId: "gid://shopify/Order/1", test: true }),
      ),
      false,
    );
    assert.equal(
      shouldIncludeBalanceTxForOrderFees(
        node({ associatedOrderId: "gid://shopify/Order/1", type: "PAYOUT" }),
      ),
      false,
    );
    assert.equal(
      shouldIncludeBalanceTxForOrderFees(
        node({ associatedOrderId: "gid://shopify/Order/1", type: "CHARGE" }),
      ),
      true,
    );
  });
});
