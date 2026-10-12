import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePayoutNetInStoreCurrency,
  deriveShopifyFxRate,
  orderStoreAmountForBalanceTx,
  payoutNetBaseLooksPlausible,
  shopifyPayoutLegacyId,
} from "../src/lib/payout-shopify-fx.ts";
import {
  shopifyOrderConversionPercent,
} from "../src/lib/fee-schedule.ts";

describe("shopifyPayoutLegacyId", () => {
  it("extrai ID numérico do GID", () => {
    assert.equal(
      shopifyPayoutLegacyId("gid://shopify/ShopifyPaymentsPayout/74170105928"),
      "74170105928",
    );
  });
});

describe("deriveShopifyFxRate", () => {
  it("calcula EUR por USD a partir de pares de BTs", () => {
    const rate = deriveShopifyFxRate([
      { storeAmount: 92, payoutAmount: 100 },
      { storeAmount: 46, payoutAmount: 50 },
    ]);
    assert.equal(rate, 0.92);
  });
});

describe("computePayoutNetInStoreCurrency", () => {
  it("soma valores na moeda da loja e converte órfãos com taxa Shopify", () => {
    const orders = new Map([
      [
        "gid://shopify/Order/1",
        { totalPrice: 100, netRevenue: 100, refunded: 0, fees: 3 },
      ],
    ]);
    const { netStore, fxRate, usedShopifyRate } = computePayoutNetInStoreCurrency(
      [
        {
          type: "CHARGE",
          netPayout: 100,
          associatedOrderId: "gid://shopify/Order/1",
          adjustmentsStoreAmount: null,
        },
        {
          type: "ADJUSTMENT",
          netPayout: -5,
          associatedOrderId: null,
          adjustmentsStoreAmount: null,
        },
      ],
      orders,
      null,
    );
    assert.equal(fxRate, 0.97);
    assert.equal(usedShopifyRate, true);
    assert.equal(netStore, 92.15);
  });
});

describe("orderStoreAmountForBalanceTx", () => {
  it("usa total − reembolsos − taxas para CHARGE", () => {
    const amt = orderStoreAmountForBalanceTx(
      {
        type: "CHARGE",
        netPayout: 50,
        associatedOrderId: "gid://shopify/Order/1",
        adjustmentsStoreAmount: null,
      },
      { totalPrice: 100, netRevenue: 100, refunded: 10, fees: 3 },
    );
    assert.equal(amt, 87);
  });
});

describe("payoutNetBaseLooksPlausible", () => {
  it("rejeita netBase com sinal oposto ao net do payout", () => {
    assert.equal(payoutNetBaseLooksPlausible(1096.27, -2311.92), false);
    assert.equal(payoutNetBaseLooksPlausible(575.59, -1066.33), false);
  });

  it("aceita netBase com o mesmo sinal", () => {
    assert.equal(payoutNetBaseLooksPlausible(100, 92), true);
    assert.equal(payoutNetBaseLooksPlausible(-50, -48), true);
  });

  it("rejeita null / zero desalinhado", () => {
    assert.equal(payoutNetBaseLooksPlausible(100, null), false);
    assert.equal(payoutNetBaseLooksPlausible(100, 0), false);
    assert.equal(payoutNetBaseLooksPlausible(0, 0), true);
  });
});

describe("shopifyOrderConversionPercent", () => {
  it("aplica +2% quando loja EUR e payout USD", () => {
    assert.equal(
      shopifyOrderConversionPercent({
        currency: "EUR",
        paymentsPayoutCurrency: "USD",
      }),
      2,
    );
    assert.equal(
      shopifyOrderConversionPercent({
        currency: "EUR",
        paymentsPayoutCurrency: "EUR",
      }),
      0,
    );
  });
});
