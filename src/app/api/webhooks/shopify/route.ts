import { NextResponse } from "next/server";
import { fetchAndUpsertOrderById } from "@/lib/shopify-sync";
import {
  claimWebhookEvent,
  findStoreByShopDomain,
  getStoreClientSecret,
  isShopifyWebhookTopic,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Webhooks Shopify (HMAC + idempotência).
 * Topics: orders/create, orders/updated, refunds/create.
 * Máx. 1 query GraphQL de encomenda por evento — sem syncStore.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";

  const store = await findStoreByShopDomain(shopDomain);
  if (!store) {
    // 401 → Shopify deixa de retry de forma agressiva em shop desconhecido
    return NextResponse.json({ error: "Loja desconhecida." }, { status: 401 });
  }

  let secret: string;
  try {
    secret = getStoreClientSecret(store);
  } catch {
    return NextResponse.json({ error: "Credenciais em falta." }, { status: 401 });
  }

  if (!verifyShopifyWebhookHmac(rawBody, hmac, secret)) {
    return NextResponse.json({ error: "HMAC inválido." }, { status: 401 });
  }

  if (!isShopifyWebhookTopic(topic)) {
    return NextResponse.json({ ok: true, skipped: "topic" });
  }

  const claimed = await claimWebhookEvent({
    storeId: String(store._id),
    workspaceId: String(store.workspaceId),
    webhookId: webhookId || `${topic}:${Date.now()}`,
    topic,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, skipped: "body" });
  }

  try {
    if (topic === "orders/create" || topic === "orders/updated") {
      const id = payload.id;
      if (id == null) {
        return NextResponse.json({ ok: true, skipped: "no_id" });
      }
      const result = await fetchAndUpsertOrderById(String(store._id), id as string | number);
      return NextResponse.json({ ok: true, ...result });
    }

    if (topic === "refunds/create") {
      const orderId =
        payload.order_id ??
        (payload.order && typeof payload.order === "object"
          ? (payload.order as { id?: unknown }).id
          : null);
      if (orderId == null) {
        return NextResponse.json({ ok: true, skipped: "no_order_id" });
      }
      const result = await fetchAndUpsertOrderById(
        String(store._id),
        orderId as string | number,
      );
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ ok: true, skipped: "topic" });
  } catch (e) {
    console.error("[webhook/shopify]", topic, e);
    // 200 para não tempestade de retries em erros transitórios de negócio
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "erro",
    });
  }
}
