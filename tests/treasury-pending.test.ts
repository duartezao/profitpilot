import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeShopifyPendingTotal,
  isShopifyPaymentsActive,
  shouldUseExternalGatewayTreasury,
} from "../src/lib/treasury.ts";
import {
  externalGatewayOrderFilter,
  isExplicitExternalPaymentGateway,
} from "../src/lib/external-gateway-treasury.ts";

describe("computeShopifyPendingTotal", () => {
  it("soma vendas por liquidar + payouts agendados sem overlap", () => {
    const r = computeShopifyPendingTotal({
      available: 3200,
      pendingTxTotal: 3177,
      allocatedIncoming: 850,
    });
    assert.equal(r.unallocated, 3177);
    assert.equal(r.shopifyPending, 3177 + 850);
  });

  it("usa saldo API quando não há balance transactions importadas", () => {
    const r = computeShopifyPendingTotal({
      available: 3200,
      pendingTxTotal: 0,
      allocatedIncoming: 900,
    });
    assert.equal(r.unallocated, 3200);
    assert.equal(r.shopifyPending, 4100);
  });

  it("evita contar pending payout como extra quando já está no saldo", () => {
    // Antes: available 3177 + incoming 3177 (pending+scheduled) = 6354
    const r = computeShopifyPendingTotal({
      available: 3177,
      pendingTxTotal: 3177,
      allocatedIncoming: 0,
    });
    assert.equal(r.shopifyPending, 3177);
  });
});

describe("shouldUseExternalGatewayTreasury", () => {
  it("activa quando há dias úteis configurados", () => {
    assert.equal(shouldUseExternalGatewayTreasury(3), true);
    assert.equal(shouldUseExternalGatewayTreasury(null), false);
    assert.equal(shouldUseExternalGatewayTreasury(0), false);
  });
});

describe("isShopifyPaymentsActive", () => {
  it("detecta sync de payouts", () => {
    assert.equal(isShopifyPaymentsActive(new Date(), 0, 0), true);
    assert.equal(isShopifyPaymentsActive(null, 500, 0), true);
    assert.equal(isShopifyPaymentsActive(null, 0, 2), true);
    assert.equal(isShopifyPaymentsActive(null, 0, 0), false);
  });
});

describe("externalGatewayOrderFilter", () => {
  it("em loja mista exclui Shopify Payments e taxas reais (null gateway = externo até sync)", () => {
    assert.deepEqual(externalGatewayOrderFilter(true), {
      feesSource: { $ne: "real" },
      paymentGateway: { $ne: "shopify_payments" },
    });
  });

  it("em loja só gateway externo inclui todas as encomendas pagas", () => {
    assert.deepEqual(externalGatewayOrderFilter(false), {});
  });
});

describe("isExplicitExternalPaymentGateway", () => {
  it("aceita gateways externos conhecidos", () => {
    assert.equal(isExplicitExternalPaymentGateway("stripe"), true);
    assert.equal(isExplicitExternalPaymentGateway("paypal"), true);
  });

  it("rejeita null, vazio e shopify_payments", () => {
    assert.equal(isExplicitExternalPaymentGateway(null), false);
    assert.equal(isExplicitExternalPaymentGateway(""), false);
    assert.equal(isExplicitExternalPaymentGateway("shopify_payments"), false);
  });
});
