import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  preferPositiveCatalogValue,
  resolveVariantCatalogCost,
  buildCatalogFallbackContext,
} from "../src/lib/catalog-fallback.ts";

describe("preferPositiveCatalogValue", () => {
  it("mantém resolved quando > 0", () => {
    assert.equal(preferPositiveCatalogValue(12.5, 10), 12.5);
    assert.equal(preferPositiveCatalogValue(8, undefined), 8);
  });

  it("não substitui custo existente por 0 da Shopify", () => {
    assert.equal(preferPositiveCatalogValue(0, 16.32), 16.32);
    assert.equal(preferPositiveCatalogValue(0, undefined), 0);
    assert.equal(preferPositiveCatalogValue(0, 0), 0);
  });
});

describe("resolveVariantCatalogCost", () => {
  it("usa irmão com custo quando a variante vem a 0", () => {
    const ctx = buildCatalogFallbackContext(
      [
        {
          id: "v1",
          price: "50",
          product: { id: "p1" },
          inventoryItem: { unitCost: { amount: "0" } },
        },
        {
          id: "v2",
          price: "50",
          product: { id: "p1" },
          inventoryItem: { unitCost: { amount: "18.5" } },
        },
      ],
      [],
    );
    assert.equal(resolveVariantCatalogCost("v1", "p1", 0, ctx), 18.5);
  });
});
