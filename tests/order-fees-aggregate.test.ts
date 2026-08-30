import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePrimaryPaymentGateway } from "../src/lib/order-fees-aggregate.ts";

describe("resolvePrimaryPaymentGateway", () => {
  it("prefere SALE/CAPTURE SUCCESS", () => {
    assert.equal(
      resolvePrimaryPaymentGateway([
        { status: "SUCCESS", kind: "AUTHORIZATION", gateway: "stripe" },
        { status: "SUCCESS", kind: "SALE", gateway: "shopify_payments" },
      ]),
      "shopify_payments",
    );
  });

  it("devolve null sem transacções SUCCESS", () => {
    assert.equal(
      resolvePrimaryPaymentGateway([{ status: "PENDING", gateway: "stripe" }]),
      null,
    );
  });
});
