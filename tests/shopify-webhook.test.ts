import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "node:crypto";
import {
  isShopifyWebhookTopic,
  orderGidFromRestId,
  verifyShopifyWebhookHmac,
} from "../src/lib/shopify-webhook.ts";

describe("shopify webhook helpers", () => {
  it("verifica HMAC Shopify (base64)", () => {
    const body = '{"id":1}';
    const secret = "shpss_test_secret";
    const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
    assert.equal(verifyShopifyWebhookHmac(body, hmac, secret), true);
    assert.equal(verifyShopifyWebhookHmac(body, "bad", secret), false);
  });

  it("reconhece topics MVP", () => {
    assert.equal(isShopifyWebhookTopic("orders/create"), true);
    assert.equal(isShopifyWebhookTopic("products/update"), false);
  });

  it("monta GID de order", () => {
    assert.equal(orderGidFromRestId(123), "gid://shopify/Order/123");
    assert.equal(orderGidFromRestId("gid://shopify/Order/99"), "gid://shopify/Order/99");
  });
});
