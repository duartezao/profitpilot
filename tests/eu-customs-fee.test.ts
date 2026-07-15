import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEuShippingCountry,
  normalizeShippingCountryCode,
} from "../src/lib/eu-customs-countries.ts";
import { appliesAutoEuCustomsFees } from "@/lib/cogs-modes.ts";
import {
  EU_CUSTOMS_FEE_EFFECTIVE_FROM,
  EU_CUSTOMS_FEE_PER_ORDER_EUR,
} from "../src/lib/eu-category-fees-types.ts";
import { resolveEuCustomsFeeOrderScope } from "../src/lib/eu-customs-fee-scope.ts";
import {
  orderCountsTowardEuCustomsFee,
  normalizeOrderFulfillmentStatus,
  shouldRevertUnshippedProductCogs,
  mergeEuCustomsEligibleOrderFilter,
} from "../src/lib/order-fulfillment-status.ts";

function isEuCustomsFeeDay(dateKey: string): boolean {
  return dateKey >= EU_CUSTOMS_FEE_EFFECTIVE_FROM;
}

function filterEuCustomsFeeDayKeys(dayKeys: string[]): string[] {
  return dayKeys.filter(isEuCustomsFeeDay);
}

describe("eu-customs-countries", () => {
  it("PT e DE são UE", () => {
    assert.equal(isEuShippingCountry("PT"), true);
    assert.equal(isEuShippingCountry("de"), true);
  });

  it("US e GB não são UE (lista Win-Win)", () => {
    assert.equal(isEuShippingCountry("US"), false);
    assert.equal(isEuShippingCountry("GB"), false);
  });

  it("normaliza código ISO2", () => {
    assert.equal(normalizeShippingCountryCode(" pt "), "PT");
    assert.equal(normalizeShippingCountryCode(""), null);
  });
});

describe("eu-customs-fee — regras", () => {
  it("taxa fixa 3 EUR por encomenda UE", () => {
    assert.equal(EU_CUSTOMS_FEE_PER_ORDER_EUR, 3);
  });

  it("só modo shopify tem taxa automática", () => {
    assert.equal(appliesAutoEuCustomsFees("shopify"), true);
    assert.equal(appliesAutoEuCustomsFees("variant"), false);
    assert.equal(appliesAutoEuCustomsFees("order"), false);
    assert.equal(appliesAutoEuCustomsFees("day"), false);
  });

  it("vigência desde 2026-06-26", () => {
    assert.equal(EU_CUSTOMS_FEE_EFFECTIVE_FROM, "2026-06-26");
    assert.equal(isEuCustomsFeeDay("2026-06-25"), false);
    assert.equal(isEuCustomsFeeDay("2026-06-26"), true);
  });

  it("filtra dias elegíveis", () => {
    assert.deepEqual(
      filterEuCustomsFeeDayKeys(["2026-06-25", "2026-06-26", "2026-07-01"]),
      ["2026-06-26", "2026-07-01"],
    );
  });

  it("país das sessões UE → todas as encomendas", () => {
    assert.equal(resolveEuCustomsFeeOrderScope("BE"), "all_paid_orders");
    assert.equal(resolveEuCustomsFeeOrderScope("PT"), "all_paid_orders");
  });

  it("país das sessões fora UE → nenhuma encomenda", () => {
    assert.equal(resolveEuCustomsFeeOrderScope("US"), "none");
    assert.equal(resolveEuCustomsFeeOrderScope("GB"), "none");
  });

  it("país das sessões vazio → fallback por envio", () => {
    assert.equal(resolveEuCustomsFeeOrderScope(null), "eu_shipping_only");
    assert.equal(resolveEuCustomsFeeOrderScope(""), "eu_shipping_only");
  });

  it("fulfillment distingue enviadas para reverter ou não no sync", () => {
    assert.equal(orderCountsTowardEuCustomsFee("fulfilled"), true);
    assert.equal(orderCountsTowardEuCustomsFee("unfulfilled"), false);
    assert.equal(normalizeOrderFulfillmentStatus(" FULFILLED "), "fulfilled");
  });

  it("taxa conta no dia; sync reverte cancelada/reembolsada sem envio", () => {
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "paid",
        cancelledAt: null,
      }),
      false,
    );
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "paid",
        cancelledAt: "2026-07-15T12:00:00Z",
      }),
      true,
    );
    assert.equal(
      shouldRevertUnshippedProductCogs({
        fulfillmentStatus: "unfulfilled",
        financialStatus: "refunded",
      }),
      true,
    );
  });

  it("filtro elegível exclui canceladas/reembolsadas sem envio", () => {
    const filter = mergeEuCustomsEligibleOrderFilter({ storeId: "x" });
    assert.ok(filter.$nor);
    assert.equal(Array.isArray(filter.$nor), true);
  });
});
