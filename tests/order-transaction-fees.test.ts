import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumSuccessfulTransactionFees } from "../src/lib/order-fees-aggregate.ts";

describe("sumSuccessfulTransactionFees", () => {
  it("soma fees de transactions SUCCESS", () => {
    const r = sumSuccessfulTransactionFees([
      {
        status: "SUCCESS",
        fees: [
          { amount: { amount: "1.20", currencyCode: "EUR" } },
          { amount: { amount: "0.30", currencyCode: "EUR" } },
        ],
      },
      {
        status: "FAILURE",
        fees: [{ amount: { amount: "9.00", currencyCode: "EUR" } }],
      },
    ]);
    assert.equal(r.amount, 1.5);
    assert.equal(r.currency, "EUR");
    assert.equal(r.hasFeeData, true);
  });

  it("sem fees → hasFeeData false", () => {
    const r = sumSuccessfulTransactionFees([
      { status: "SUCCESS", fees: [] },
      { status: "SUCCESS", fees: null },
    ]);
    assert.equal(r.amount, 0);
    assert.equal(r.hasFeeData, false);
  });

  it("fee 0 com dados → hasFeeData true", () => {
    const r = sumSuccessfulTransactionFees([
      {
        status: "SUCCESS",
        fees: [{ amount: { amount: "0.00", currencyCode: "EUR" } }],
      },
    ]);
    assert.equal(r.amount, 0);
    assert.equal(r.hasFeeData, true);
  });
});
