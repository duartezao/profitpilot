import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      return;
    } catch {
      /* */
    }
  }
}
loadEnv();

const storeId = process.argv[2] ?? "6a2f3c90f28d6fea7e49ddf3";
const variantIds = process.argv.slice(3);
if (!variantIds.length) {
  variantIds.push(
    "gid://shopify/ProductVariant/57848425283919",
    "gid://shopify/ProductVariant/57848925159759",
    "gid://shopify/ProductVariant/57848276091215",
  );
}

const { Store } = await import("@/models/Store");
const { decrypt } = await import("@/lib/crypto");
const {
  getClientCredentialsToken,
  normalizeShopDomain,
  SHOPIFY_API_VERSION,
} = await import("@/lib/shopify");

const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URI!);
const store = await Store.findById(storeId).lean();
if (!store?.credentials || !store.shopDomain) {
  console.error("Loja inválida");
  process.exit(1);
}
const creds = JSON.parse(decrypt(store.credentials)) as {
  clientId: string;
  clientSecret: string;
};
const domain = normalizeShopDomain(store.shopDomain);
const { accessToken } = await getClientCredentialsToken(
  domain,
  creds.clientId,
  creds.clientSecret,
);

const query = `query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      title
      inventoryItem { unitCost { amount } updatedAt }
      product {
        title
        variants(first: 8) {
          nodes {
            id
            title
            inventoryItem { unitCost { amount } }
          }
        }
      }
    }
  }
}`;

const res = await fetch(
  `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables: { ids: variantIds } }),
  },
);

const json = (await res.json()) as {
  data?: { nodes: Array<Record<string, unknown>> };
  errors?: unknown;
};
if (json.errors) console.error("GraphQL errors:", json.errors);

for (const node of json.data?.nodes ?? []) {
  if (!node?.id) continue;
  const product = node.product as {
    title?: string;
    variants?: { nodes: Array<{ title?: string; inventoryItem?: { unitCost?: { amount?: string } } }> };
  };
  const inv = node.inventoryItem as { unitCost?: { amount?: string }; updatedAt?: string };
  console.log("\n---", product?.title, "|", node.title, "---");
  console.log("  variante vendida unitCost:", inv?.unitCost?.amount ?? "0");
  console.log("  inventory updatedAt:", inv?.updatedAt ?? "—");
  const siblings = product?.variants?.nodes ?? [];
  const costs = siblings
    .map((s) => Number(s.inventoryItem?.unitCost?.amount ?? 0))
    .filter((n) => n > 0);
  console.log(
    `  primeiras ${siblings.length} variantes: max cost = ${costs.length ? Math.max(...costs) : 0}`,
  );
}

await mongoose.disconnect();
