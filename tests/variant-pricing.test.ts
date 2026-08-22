import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulateVariantBer } from "../src/lib/variant-pricing-intelligence.ts";

describe("simulateVariantBer", () => {
  it("calcula BER com envio e taxas médios", () => {
    const r = simulateVariantBer({
      salePrice: 50,
      unitCost: 15,
      shippingPerUnit: 5,
      feesPerUnit: 2,
    });
    assert.equal(r.contributionMargin, 28);
    assert.equal(r.ber, 50 / 28);
  });

  it("devolve BER null quando margem não é positiva", () => {
    const r = simulateVariantBer({
      salePrice: 20,
      unitCost: 18,
      shippingPerUnit: 5,
      feesPerUnit: 2,
    });
    assert.equal(r.ber, null);
    assert.ok(r.contributionMargin < 0);
  });
});
