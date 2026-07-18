import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { connectToDatabase } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { normalizeShopDomain } from "@/lib/shopify";
import { Store, type StoreDoc } from "@/models/Store";
import { WebhookEvent } from "@/models/WebhookEvent";

export const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "refunds/create",
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];

export function isShopifyWebhookTopic(
  topic: string,
): topic is ShopifyWebhookTopic {
  return (SHOPIFY_WEBHOOK_TOPICS as readonly string[]).includes(topic);
}

export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  clientSecret: string,
): boolean {
  if (!hmacHeader || !clientSecret) return false;
  const digest = createHmac("sha256", clientSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getStoreClientSecret(store: StoreDoc): string {
  if (!store.credentials) {
    throw new Error("Loja sem credenciais.");
  }
  const parsed = JSON.parse(decrypt(store.credentials)) as {
    clientSecret?: string;
  };
  if (!parsed.clientSecret) {
    throw new Error("Loja sem client secret.");
  }
  return parsed.clientSecret;
}

/** Resolve loja activa pelo domínio do header Shopify. */
export async function findStoreByShopDomain(
  shopDomainHeader: string | null,
): Promise<StoreDoc | null> {
  if (!shopDomainHeader) return null;
  await connectToDatabase();
  const domain = normalizeShopDomain(shopDomainHeader);
  return Store.findOne({
    shopDomain: domain,
    deletedAt: null,
    status: "active",
    platform: "shopify",
  }).lean();
}

/**
 * Reserva o webhookId. `false` = já processado (idempotente).
 */
export async function claimWebhookEvent(input: {
  storeId: string;
  workspaceId: string;
  webhookId: string;
  topic: string;
}): Promise<boolean> {
  if (!input.webhookId) return true;
  try {
    await WebhookEvent.create({
      storeId: input.storeId,
      workspaceId: input.workspaceId,
      webhookId: input.webhookId,
      topic: input.topic,
      processedAt: new Date(),
    });
    return true;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code?: number }).code
        : undefined;
    if (code === 11000) return false;
    throw e;
  }
}

export function appPublicBaseUrl(): string | null {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function shopifyWebhookCallbackUrl(): string | null {
  const base = appPublicBaseUrl();
  if (!base) return null;
  return `${base}/api/webhooks/shopify`;
}

/** GID GraphQL a partir do id numérico do webhook REST. */
export function orderGidFromRestId(id: string | number): string {
  const n = String(id).replace(/\D/g, "");
  return `gid://shopify/Order/${n}`;
}
