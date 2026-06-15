import "server-only";
import type { AnyBulkWriteOperation } from "mongoose";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";
import { Dispute } from "@/models/Dispute";
import type { StoreDoc } from "@/models/Store";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

/**
 * Importa disputas (chargebacks) do Shopify Payments.
 * Requer scope `read_shopify_payments_disputes`.
 */
export async function syncDisputes(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<number> {
  const query = `query($cursor: String) {
    shopifyPaymentsAccount {
      disputes(first: 50, after: $cursor, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          status
          type
          amount { amount currencyCode }
          initiatedAt
          finalizedOn
          reasonDetails { reason }
          order { id name }
        }
      }
    }
  }`;

  type Resp = {
    shopifyPaymentsAccount: {
      disputes: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          status: string | null;
          type: string | null;
          amount: { amount: string; currencyCode?: string } | null;
          initiatedAt: string;
          finalizedOn: string | null;
          reasonDetails: { reason: string | null } | null;
          order: { id: string; name: string | null } | null;
        }>;
      };
    } | null;
  };

  let cursor: string | null = null;
  let count = 0;

  for (let page = 0; page < 10; page++) {
    const gqlData: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
    });
    const account = gqlData.shopifyPaymentsAccount;
    if (!account) break;

    const ops: AnyBulkWriteOperation[] = account.disputes.nodes.map((d) => ({
      updateOne: {
        filter: { storeId: store._id, shopifyId: d.id },
        update: {
          $set: {
            workspaceId: store.workspaceId,
            storeId: store._id,
            shopifyId: d.id,
            initiatedAt: new Date(d.initiatedAt),
            finalizedAt: d.finalizedOn ? new Date(d.finalizedOn) : null,
            status: d.status ?? "",
            type: d.type ?? "",
            amount: num(d.amount?.amount),
            currency: d.amount?.currencyCode ?? store.currency ?? "EUR",
            orderShopifyId: d.order?.id ?? null,
            orderName: d.order?.name ?? null,
            reason: d.reasonDetails?.reason ?? null,
          },
        },
        upsert: true,
      },
    }));

    if (ops.length) {
      await Dispute.bulkWrite(ops, { ordered: false });
      count += ops.length;
    }

    if (!account.disputes.pageInfo.hasNextPage) break;
    cursor = account.disputes.pageInfo.endCursor;
  }

  return count;
}
