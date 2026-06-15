import "server-only";
import type { AnyBulkWriteOperation } from "mongoose";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { rebuildLineUnitPricesFromShopify } from "@/lib/line-snapshots";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

const ORDER_BATCH = 50;
const SHOPIFY_IDS_BATCH = 50;

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

  if (!res.ok) {
    throw new Error(`Shopify respondeu ${res.status}.`);
  }

  const json = (await res.json()) as GraphQLResult<T>;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  if (!json.data) {
    throw new Error("Resposta vazia da Shopify.");
  }
  return json.data;
}

async function fetchShopifyOrderLinePrices(
  domain: string,
  token: string,
  shopifyIds: string[],
): Promise<Map<string, number[]>> {
  if (!shopifyIds.length) return new Map();

  const query = `query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        lineItems(first: 100) {
          nodes {
            originalUnitPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  }`;

  type Resp = {
    nodes: Array<{
      id?: string;
      lineItems?: {
        nodes: Array<{
          originalUnitPriceSet?: { shopMoney?: { amount?: string } } | null;
        }>;
      };
    } | null>;
  };

  const data = await shopifyGraphQL<Resp>(domain, token, query, {
    ids: shopifyIds,
  });

  const out = new Map<string, number[]>();
  for (const node of data.nodes) {
    if (!node?.id) continue;
    const unitPrices = (node.lineItems?.nodes ?? []).map((li) =>
      num(li.originalUnitPriceSet?.shopMoney?.amount),
    );
    out.set(node.id, unitPrices);
  }
  return out;
}

export type OrderLinePriceBackfillResult = {
  ordersChecked: number;
  ordersUpdated: number;
  linesUpdated: number;
};

/**
 * Repõe `unitPrice` nas linhas a partir do preço original de cada encomenda na Shopify.
 * Corrige dados importados antes do snapshot imutável de preço.
 */
export async function backfillOrderLinePricesForStore(
  storeId: mongoose.Types.ObjectId | string,
  domain: string,
  token: string,
): Promise<OrderLinePriceBackfillResult> {
  await connectToDatabase();
  const storeOid =
    storeId instanceof Types.ObjectId
      ? storeId
      : new mongoose.Types.ObjectId(storeId);

  const result: OrderLinePriceBackfillResult = {
    ordersChecked: 0,
    ordersUpdated: 0,
    linesUpdated: 0,
  };

  let lastId: Types.ObjectId | null = null;

  while (true) {
    const filter: Record<string, unknown> = { storeId: storeOid };
    if (lastId) filter._id = { $gt: lastId };

    const orders = await Order.find(filter)
      .select("_id shopifyId lineItems")
      .sort({ _id: 1 })
      .limit(ORDER_BATCH)
      .lean();

    if (!orders.length) break;

    for (let i = 0; i < orders.length; i += SHOPIFY_IDS_BATCH) {
      const chunk = orders.slice(i, i + SHOPIFY_IDS_BATCH);
      const shopifyIds = chunk.map((o) => String(o.shopifyId));
      const priceMap = await fetchShopifyOrderLinePrices(
        domain,
        token,
        shopifyIds,
      );

      const bulkOps: AnyBulkWriteOperation[] = [];

      for (const order of chunk) {
        result.ordersChecked++;
        lastId = order._id;

        const shopifyPrices = priceMap.get(String(order.shopifyId));
        if (!shopifyPrices?.length) continue;

        const localLines = order.lineItems ?? [];
        const { lines, linesChanged } = rebuildLineUnitPricesFromShopify(
          localLines,
          shopifyPrices,
        );
        if (!linesChanged) continue;

        result.ordersUpdated++;
        result.linesUpdated += linesChanged;
        bulkOps.push({
          updateOne: {
            filter: { _id: order._id },
            update: { $set: { lineItems: lines } },
          },
        });
      }

      if (bulkOps.length) {
        await Order.bulkWrite(bulkOps, { ordered: false });
      }
    }

    if (orders.length < ORDER_BATCH) break;
  }

  return result;
}
