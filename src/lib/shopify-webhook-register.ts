import "server-only";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";
import {
  SHOPIFY_WEBHOOK_TOPICS,
  shopifyWebhookCallbackUrl,
  type ShopifyWebhookTopic,
} from "@/lib/shopify-webhook";
import { Store } from "@/models/Store";

/** Topics GraphQL enum ↔ REST topic string. */
const TOPIC_TO_GRAPHQL: Record<ShopifyWebhookTopic, string> = {
  "orders/create": "ORDERS_CREATE",
  "orders/updated": "ORDERS_UPDATED",
  "refunds/create": "REFUNDS_CREATE",
};

type GraphQLResult<T> = { data?: T; errors?: Array<{ message: string }> };

async function shopifyGraphQL<T>(
  domain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify respondeu ${res.status}.`);
  const json = (await res.json()) as GraphQLResult<T>;
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("Resposta vazia da Shopify.");
  return json.data;
}

const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Garante subscriptions dos topics MVP. Idempotente.
 * Requer APP_URL / NEXT_PUBLIC_APP_URL público HTTPS em produção.
 */
export async function ensureShopifyWebhooksRegistered(
  storeId: string,
  domain: string,
  accessToken: string,
  opts?: { force?: boolean; webhooksRegisteredAt?: Date | null },
): Promise<{ registered: number; skipped: boolean; error?: string }> {
  const callbackUrl = shopifyWebhookCallbackUrl();
  if (!callbackUrl) {
    return {
      registered: 0,
      skipped: true,
      error: "APP_URL / NEXT_PUBLIC_APP_URL não configurado.",
    };
  }

  if (
    !opts?.force &&
    opts?.webhooksRegisteredAt &&
    Date.now() - new Date(opts.webhooksRegisteredAt).getTime() < RECHECK_MS
  ) {
    return { registered: 0, skipped: true };
  }

  type ListResp = {
    webhookSubscriptions: {
      nodes: Array<{
        id: string;
        topic: string;
        uri?: string | null;
        endpoint?: { __typename?: string; callbackUrl?: string } | null;
      }>;
    };
  };

  // API 2025-10: preferir `uri`; `endpoint.callbackUrl` ainda funciona em leitura.
  const listQuery = `{
    webhookSubscriptions(first: 50) {
      nodes {
        id
        topic
        uri
        endpoint {
          __typename
          ... on WebhookHttpEndpoint { callbackUrl }
        }
      }
    }
  }`;

  let existing: ListResp;
  try {
    existing = await shopifyGraphQL<ListResp>(domain, accessToken, listQuery);
  } catch (e) {
    return {
      registered: 0,
      skipped: false,
      error: e instanceof Error ? e.message : "list failed",
    };
  }

  const have = new Set(
    existing.webhookSubscriptions.nodes
      .filter((n) => {
        const url = (n.uri ?? n.endpoint?.callbackUrl ?? "").replace(/\/+$/, "");
        return url === callbackUrl;
      })
      .map((n) => n.topic),
  );

  const createMutation = `mutation($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { uri: $uri, format: JSON }
    ) {
      userErrors { field message }
      webhookSubscription { id topic uri }
    }
  }`;

  let registered = 0;
  for (const restTopic of SHOPIFY_WEBHOOK_TOPICS) {
    const gqlTopic = TOPIC_TO_GRAPHQL[restTopic];
    if (have.has(gqlTopic)) continue;

    try {
      type CreateResp = {
        webhookSubscriptionCreate: {
          userErrors: Array<{ message: string }>;
        };
      };
      const created = await shopifyGraphQL<CreateResp>(
        domain,
        accessToken,
        createMutation,
        { topic: gqlTopic, uri: callbackUrl },
      );
      const errs = created.webhookSubscriptionCreate.userErrors;
      if (errs?.length) {
        console.error("[webhooks] create", restTopic, errs[0].message);
        continue;
      }
      registered++;
    } catch (e) {
      console.error("[webhooks] create", restTopic, e);
    }
  }

  await Store.updateOne(
    { _id: storeId },
    { $set: { webhooksRegisteredAt: new Date() } },
  );

  return { registered, skipped: false };
}
