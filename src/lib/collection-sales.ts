import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { loadProductCatalogMap } from "@/lib/product-catalog";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import { orderNetRevenue } from "@/lib/order-revenue";
import { formatCurrency } from "@/lib/utils";
import {
  type PeriodInput,
  type ResolvedPeriod,
  parseDateInput,
} from "@/lib/period";
import {
  dateKeyInTimezone,
  dayKeysBetweenInTimezone,
  normalizeStoreTimezone,
  orderDateMatchInTimezone,
  resolvePeriodForStore,
} from "@/lib/store-timezone";
import { NON_ARCHIVED_STORE_FILTER } from "@/lib/store-scope";

const UNKNOWN_COLLECTION_ID = "__none__";

type PeriodSlice = Pick<ResolvedPeriod, "start" | "end" | "specificDates">;

export type CollectionSalesDay = {
  dateKey: string;
  dateLabel: string;
  units: number;
  revenue: number;
  revenueFmt: string;
};

export type CollectionSalesRow = {
  collectionId: string;
  collectionTitle: string;
  handle: string | null;
  units: number;
  revenue: number;
  revenueFmt: string;
  daily: CollectionSalesDay[];
};

export type ProductWithCollectionRow = {
  title: string;
  collectionTitle: string;
  units: number;
  revenue: string;
};

type OrderLine = {
  productId?: string | null;
  title?: string | null;
  unitPrice?: number | null;
  quantity?: number | null;
};

type OrderForCollectionSales = {
  orderDate: Date;
  lineItems?: OrderLine[] | null;
  netRevenue?: number | null;
  subtotal?: number | null;
  totalPrice?: number | null;
  refunded?: number | null;
  amountsBase?: {
    netRevenue?: number | null;
    fxRate?: number | null;
  } | null;
};

function lineStoreRevenue(li: OrderLine): number {
  return (li.unitPrice ?? 0) * (li.quantity ?? 0);
}

function orderLineRevenueBasis(order: OrderForCollectionSales): number {
  let total = 0;
  for (const li of order.lineItems ?? []) {
    total += lineStoreRevenue(li);
  }
  return total;
}

function orderFxRate(order: OrderForCollectionSales): number {
  const base = order.amountsBase?.netRevenue;
  const store = order.netRevenue ?? orderNetRevenue(order);
  if (base != null && store > 0) return base / store;
  const fx = order.amountsBase?.fxRate;
  return fx != null && fx > 0 ? fx : 1;
}

function allocateBaseFromOrder(
  order: OrderForCollectionSales,
  lineStoreAmount: number,
  orderBaseTotal: number | null | undefined,
  storeBasis: number,
): number {
  if (orderBaseTotal != null) {
    if (storeBasis > 0) return orderBaseTotal * (lineStoreAmount / storeBasis);
    const n = order.lineItems?.length ?? 1;
    return orderBaseTotal / Math.max(n, 1);
  }
  return lineStoreAmount * orderFxRate(order);
}

function dayKeysInSlice(slice: PeriodSlice, storeTimeZone: string): string[] {
  if (slice.specificDates?.length) {
    return [...slice.specificDates].sort();
  }
  return dayKeysBetweenInTimezone(slice.start, slice.end, storeTimeZone);
}

function formatDayLabel(dateKey: string): string {
  const d = parseDateInput(dateKey);
  return d
    ? d.toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : dateKey;
}

type CollectionAgg = {
  collectionTitle: string;
  handle: string | null;
  units: number;
  revenue: number;
  byDay: Map<string, { units: number; revenue: number }>;
};

export async function buildCollectionSalesReport(
  workspaceId: string,
  storeId: string,
  periodInput?: PeriodInput,
  options?: { productLimit?: number; collectionLimit?: number },
): Promise<{
  collections: CollectionSalesRow[];
  products: ProductWithCollectionRow[];
  storeName: string;
  periodLabel: string;
  catalogMappedCount: number;
  unmappedProductCount: number;
  lastCatalogSyncAt: string | null;
}> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const store = await Store.findOne({
    _id: storeId,
    workspaceId: wsId,
    deletedAt: null,
    ...NON_ARCHIVED_STORE_FILTER,
  })
    .select("name currency ianaTimezone")
    .lean();

  if (!store) {
    return {
      collections: [],
      products: [],
      storeName: "",
      periodLabel: "",
      catalogMappedCount: 0,
      unmappedProductCount: 0,
      lastCatalogSyncAt: null,
    };
  }

  const storeTz = normalizeStoreTimezone(store.ianaTimezone);
  const period = resolvePeriodForStore(periodInput, storeTz);
  const currency =
    (await Workspace.findById(wsId).select("baseCurrency").lean())
      ?.baseCurrency ??
    store.currency ??
    "EUR";
  const fmtMoney = (v: number) => formatCurrency(v, currency);

  const slice: PeriodSlice = {
    start: period.start,
    end: period.end,
    specificDates: period.specificDates,
  };

  const orders = (await Order.find(
    mergePaidOrderFilter({
      storeId: store._id,
      ...orderDateMatchInTimezone(slice, storeTz),
    }),
  )
    .select(
      "orderDate lineItems netRevenue subtotal totalPrice refunded amountsBase.netRevenue amountsBase.fxRate",
    )
    .lean()) as OrderForCollectionSales[];

  const soldProductIds = new Set<string>();
  for (const order of orders) {
    for (const li of order.lineItems ?? []) {
      if (li.productId) soldProductIds.add(String(li.productId));
    }
  }

  const catalog = await loadProductCatalogMap(store._id, [...soldProductIds]);
  let lastCatalogSyncAt: Date | null = null;

  const byCollection = new Map<string, CollectionAgg>();
  const productAgg = new Map<
    string,
    { title: string; collectionTitle: string; units: number; revenue: number }
  >();
  const unmappedProducts = new Set<string>();

  for (const order of orders) {
    const dateKey = dateKeyInTimezone(new Date(order.orderDate), storeTz);
    const storeBasis =
      orderLineRevenueBasis(order) ||
      order.netRevenue ||
      orderNetRevenue(order);
    const netRevBase = order.amountsBase?.netRevenue;

    for (const li of order.lineItems ?? []) {
      const qty = li.quantity ?? 0;
      if (qty <= 0) continue;

      const productId = li.productId ? String(li.productId) : "";
      const cat = productId ? catalog.get(productId) : undefined;
      if (productId && !cat) {
        unmappedProducts.add(productId);
      }

      const colId = cat?.primaryCollectionId ?? UNKNOWN_COLLECTION_ID;
      const colTitle =
        cat?.primaryCollectionTitle ??
        (productId ? "(coleção por mapear)" : "(sem produto)");
      const handle = cat?.primaryCollectionHandle ?? null;

      const lineRevStore = lineStoreRevenue(li);
      const rev = allocateBaseFromOrder(
        order,
        lineRevStore,
        netRevBase,
        storeBasis,
      );

      let col = byCollection.get(colId);
      if (!col) {
        col = {
          collectionTitle: colTitle,
          handle,
          units: 0,
          revenue: 0,
          byDay: new Map(),
        };
        byCollection.set(colId, col);
      }
      col.units += qty;
      col.revenue += rev;

      const day = col.byDay.get(dateKey) ?? { units: 0, revenue: 0 };
      day.units += qty;
      day.revenue += rev;
      col.byDay.set(dateKey, day);

      const title = li.title || cat?.title || "(sem nome)";
      const prodKey = `${colId}:${title}`;
      const prod = productAgg.get(prodKey) ?? {
        title,
        collectionTitle: colTitle,
        units: 0,
        revenue: 0,
      };
      prod.units += qty;
      prod.revenue += rev;
      productAgg.set(prodKey, prod);
    }
  }

  const dayKeys = dayKeysInSlice(slice, storeTz);

  const collections = [...byCollection.entries()]
    .map(([collectionId, agg]) => ({
      collectionId,
      collectionTitle: agg.collectionTitle,
      handle: agg.handle,
      units: agg.units,
      revenue: agg.revenue,
      revenueFmt: fmtMoney(agg.revenue),
      daily: dayKeys
        .map((dateKey) => {
          const d = agg.byDay.get(dateKey) ?? { units: 0, revenue: 0 };
          return {
            dateKey,
            dateLabel: formatDayLabel(dateKey),
            units: d.units,
            revenue: d.revenue,
            revenueFmt: fmtMoney(d.revenue),
          };
        })
        .filter((d) => d.units > 0),
    }))
    .sort((a, b) => b.units - a.units)
    .slice(0, options?.collectionLimit ?? 50);

  const products = [...productAgg.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, options?.productLimit ?? 30)
    .map((p) => ({
      title: p.title,
      collectionTitle: p.collectionTitle,
      units: p.units,
      revenue: fmtMoney(p.revenue),
    }));

  if (soldProductIds.size > 0) {
    const { ProductCatalog } = await import("@/models/ProductCatalog");
    const latest = await ProductCatalog.findOne({
      storeId: store._id,
      productId: { $in: [...soldProductIds] },
      collectionsSyncedAt: { $ne: null },
    })
      .sort({ collectionsSyncedAt: -1 })
      .select("collectionsSyncedAt")
      .lean();
    lastCatalogSyncAt = latest?.collectionsSyncedAt ?? null;
  }

  return {
    collections,
    products,
    storeName: store.name,
    periodLabel: period.label,
    catalogMappedCount: catalog.size,
    unmappedProductCount: unmappedProducts.size,
    lastCatalogSyncAt: lastCatalogSyncAt?.toISOString() ?? null,
  };
}
