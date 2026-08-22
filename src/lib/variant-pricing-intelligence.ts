import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { ProductCost } from "@/models/ProductCost";
import { PriceHistory } from "@/models/PriceHistory";
import { CogsHistory } from "@/models/CogsHistory";
import { Store } from "@/models/Store";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import { berRoas } from "@/lib/profit";
import { orderNetRevenue } from "@/lib/order-revenue";
import { orderCogsBase } from "@/lib/order-money";
import { NON_ARCHIVED_STORE_FILTER } from "@/lib/store-scope";
import type {
  HistoryPeriodRow,
  VariantListItem,
  VariantPricingSnapshot,
} from "@/lib/variant-pricing-types";

export type {
  HistoryPeriodRow,
  VariantListItem,
  VariantPricingSnapshot,
} from "@/lib/variant-pricing-types";

type PeriodDef = {
  id: string;
  value: number;
  source: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type LineSale = {
  orderId: string;
  orderDate: Date;
  units: number;
  revenue: number;
  shipping: number;
  fees: number;
  unitPrice: number;
  unitCost: number;
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function periodLabel(from: Date, to: Date | null): string {
  if (!to) return `desde ${fmtDate(from)}`;
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function daysActive(from: Date, to: Date | null, now = new Date()): number {
  const end = to ?? now;
  const ms = end.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function findPeriodForDate(
  periods: PeriodDef[],
  date: Date,
): PeriodDef | null {
  const t = date.getTime();
  for (const p of periods) {
    const from = p.effectiveFrom.getTime();
    const to = p.effectiveTo ? p.effectiveTo.getTime() : Number.POSITIVE_INFINITY;
    if (t >= from && t < to) return p;
  }
  return periods.length ? periods[periods.length - 1] : null;
}

function lineStoreRevenue(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

function orderLineRevenueBasis(
  lines: Array<{ unitPrice?: number | null; quantity?: number | null }>,
): number {
  let total = 0;
  for (const li of lines) {
    total += lineStoreRevenue(li.unitPrice ?? 0, li.quantity ?? 0);
  }
  return total;
}

function orderFxRate(order: {
  netRevenue?: number | null;
  subtotal?: number | null;
  totalPrice?: number | null;
  refunded?: number | null;
  amountsBase?: { netRevenue?: number | null; fxRate?: number | null } | null;
}): number {
  const base = order.amountsBase?.netRevenue;
  const store = order.netRevenue ?? orderNetRevenue(order);
  if (base != null && store > 0) return base / store;
  const fx = order.amountsBase?.fxRate;
  return fx != null && fx > 0 ? fx : 1;
}

function allocateBaseFromOrder(
  order: {
    lineItems?: Array<{ unitPrice?: number | null; quantity?: number | null }>;
    netRevenue?: number | null;
    subtotal?: number | null;
    totalPrice?: number | null;
    refunded?: number | null;
    amountsBase?: { netRevenue?: number | null; fxRate?: number | null } | null;
  },
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

function buildPeriodRows(
  periods: PeriodDef[],
  sales: LineSale[],
): HistoryPeriodRow[] {
  const agg = new Map<
    string,
    {
      period: PeriodDef;
      units: number;
      orders: Set<string>;
      revenue: number;
    }
  >();

  for (const p of periods) {
    agg.set(p.id, { period: p, units: 0, orders: new Set(), revenue: 0 });
  }

  for (const sale of sales) {
    const period = findPeriodForDate(periods, sale.orderDate);
    if (!period) continue;
    const row = agg.get(period.id);
    if (!row) continue;
    row.units += sale.units;
    row.orders.add(sale.orderId);
    row.revenue += sale.revenue;
  }

  return periods
    .map((p) => {
      const row = agg.get(p.id)!;
      const days = daysActive(p.effectiveFrom, p.effectiveTo);
      const units = row.units;
      return {
        id: p.id,
        value: p.value,
        source: p.source,
        effectiveFrom: p.effectiveFrom.toISOString(),
        effectiveTo: p.effectiveTo?.toISOString() ?? null,
        periodLabel: periodLabel(p.effectiveFrom, p.effectiveTo),
        daysActive: days,
        unitsSold: units,
        orderCount: row.orders.size,
        unitsPerDay: units > 0 ? Math.round((units / days) * 100) / 100 : null,
        revenue: Math.round(row.revenue * 100) / 100,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
    );
}

export function simulateVariantBer(opts: {
  salePrice: number;
  unitCost: number;
  shippingPerUnit: number;
  feesPerUnit: number;
}): {
  ber: number | null;
  contributionMargin: number;
  marginPct: number;
} {
  const revenue = Math.max(0, opts.salePrice);
  const cogs = Math.max(0, opts.unitCost);
  const shipping = Math.max(0, opts.shippingPerUnit);
  const fees = Math.max(0, opts.feesPerUnit);
  const cm = revenue - cogs - shipping - fees;
  const ber = berRoas({ revenue, cogs, shipping, fees });
  const marginPct = revenue > 0 ? (cm / revenue) * 100 : 0;
  return {
    ber,
    contributionMargin: Math.round(cm * 100) / 100,
    marginPct: Math.round(marginPct * 100) / 100,
  };
}

export async function listStoreVariantsForPricing(
  workspaceId: string,
  storeId: string,
): Promise<VariantListItem[]> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const wsOid = new mongoose.Types.ObjectId(workspaceId);

  const store = await Store.findOne({
    _id: storeOid,
    workspaceId: wsOid,
    deletedAt: null,
    ...NON_ARCHIVED_STORE_FILTER,
  })
    .select("_id")
    .lean();
  if (!store) return [];

  const unitAgg = await Order.aggregate<{ _id: string; units: number }>([
    {
      $match: mergePaidOrderFilter({
        storeId: storeOid,
        "lineItems.variantId": { $exists: true },
      }),
    },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $ne: null },
        "lineItems.quantity": { $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$lineItems.variantId",
        units: { $sum: "$lineItems.quantity" },
      },
    },
    { $match: { units: { $gt: 0 } } },
    { $sort: { units: -1 } },
  ]);

  if (!unitAgg.length) return [];

  const soldVariantIds = unitAgg.map((r) => r._id);
  const unitsByVariant = new Map(unitAgg.map((r) => [r._id, r.units]));

  const catalogRows = await ProductCost.find({
    storeId: storeOid,
    variantId: { $in: soldVariantIds },
  })
    .select("variantId title price unitCost")
    .lean();

  const catalogByVariant = new Map(
    catalogRows.map((c) => [c.variantId, c]),
  );

  return soldVariantIds.map((variantId) => {
    const catalog = catalogByVariant.get(variantId);
    return {
      variantId,
      title: catalog?.title?.trim() || variantId,
      price: catalog?.price ?? 0,
      unitCost: catalog?.unitCost ?? 0,
      unitsSold: unitsByVariant.get(variantId) ?? 0,
    };
  });
}

export async function loadVariantPricingSnapshot(
  workspaceId: string,
  storeId: string,
  variantId: string,
): Promise<VariantPricingSnapshot | null> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const wsOid = new mongoose.Types.ObjectId(workspaceId);

  const store = await Store.findOne({
    _id: storeOid,
    workspaceId: wsOid,
    deletedAt: null,
    ...NON_ARCHIVED_STORE_FILTER,
  })
    .select("currency")
    .lean();
  if (!store) return null;

  const catalog = await ProductCost.findOne({ storeId: storeOid, variantId })
    .select("title price unitCost")
    .lean();

  const [priceRows, costRows, orders] = await Promise.all([
    PriceHistory.find({ storeId: storeOid, variantId })
      .sort({ effectiveFrom: 1 })
      .lean(),
    CogsHistory.find({ storeId: storeOid, variantId })
      .sort({ effectiveFrom: 1 })
      .lean(),
    Order.find(
      mergePaidOrderFilter({
        storeId: storeOid,
        lineItems: { $elemMatch: { variantId } },
      }),
    )
      .select(
        "orderDate lineItems shipping fees netRevenue subtotal totalPrice refunded amountsBase cogs manualCogs",
      )
      .sort({ orderDate: 1 })
      .lean(),
  ]);

  const pricePeriods: PeriodDef[] = priceRows.map((r, i) => ({
    id: `price-${i}`,
    value: r.price,
    source: r.source ?? "shopify",
    effectiveFrom: new Date(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
  }));

  if (!pricePeriods.length && catalog?.price != null) {
    pricePeriods.push({
      id: "price-current",
      value: catalog.price,
      source: "catalog",
      effectiveFrom: new Date(0),
      effectiveTo: null,
    });
  }

  const costPeriods: PeriodDef[] = costRows.map((r, i) => ({
    id: `cost-${i}`,
    value: r.cost,
    source: r.source,
    effectiveFrom: new Date(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
  }));

  if (!costPeriods.length && catalog?.unitCost != null) {
    costPeriods.push({
      id: "cost-current",
      value: catalog.unitCost,
      source: "catalog",
      effectiveFrom: new Date(0),
      effectiveTo: null,
    });
  }

  const sales: LineSale[] = [];
  let totalUnits = 0;
  let totalShipping = 0;
  let totalFees = 0;
  let totalRevenue = 0;
  let totalCogs = 0;
  const orderKeys = new Set<string>();

  for (const order of orders) {
    const lines = (order.lineItems ?? []).filter(
      (li) => li.variantId === variantId && (li.quantity ?? 0) > 0,
    );
    if (!lines.length) continue;

    const storeBasis =
      orderLineRevenueBasis(order.lineItems ?? []) ||
      order.netRevenue ||
      orderNetRevenue(order);
    const netRevBase =
      order.amountsBase?.netRevenue ??
      (order.netRevenue ?? 0) * orderFxRate(order);
    const shippingBase =
      order.amountsBase?.shipping ??
      (order.shipping ?? 0) * orderFxRate(order);
    const feesBase =
      order.amountsBase?.fees ?? (order.fees ?? 0) * orderFxRate(order);
    const cogsBaseTotal = orderCogsBase(order);

    let orderCogsStore = 0;
    for (const li of order.lineItems ?? []) {
      orderCogsStore += (li.unitCost ?? 0) * (li.quantity ?? 0);
    }

    for (const li of lines) {
      const qty = li.quantity ?? 0;
      const lineRevStore = lineStoreRevenue(li.unitPrice ?? 0, qty);
      const rev = allocateBaseFromOrder(
        order,
        lineRevStore,
        netRevBase,
        storeBasis,
      );
      const costStore = (li.unitCost ?? 0) * qty;
      const cost =
        cogsBaseTotal != null && orderCogsStore > 0
          ? cogsBaseTotal * (costStore / orderCogsStore)
          : costStore * orderFxRate(order);
      const share = storeBasis > 0 ? lineRevStore / storeBasis : 0;
      const ship = shippingBase * share;
      const fee = feesBase * share;

      sales.push({
        orderId: String(order._id),
        orderDate: new Date(order.orderDate),
        units: qty,
        revenue: rev,
        shipping: ship,
        fees: fee,
        unitPrice: li.unitPrice ?? 0,
        unitCost: li.unitCost ?? 0,
      });

      totalUnits += qty;
      totalRevenue += rev;
      totalCogs += cost;
      totalShipping += ship;
      totalFees += fee;
      orderKeys.add(String(order._id));
    }
  }

  const avgShippingPerUnit =
    totalUnits > 0 ? Math.round((totalShipping / totalUnits) * 100) / 100 : 0;
  const avgFeesPerUnit =
    totalUnits > 0 ? Math.round((totalFees / totalUnits) * 100) / 100 : 0;

  const currentPrice = catalog?.price ?? pricePeriods.at(-1)?.value ?? 0;
  const currentCost = catalog?.unitCost ?? costPeriods.at(-1)?.value ?? 0;

  if (totalUnits === 0) return null;

  const actualBer = berRoas({
    revenue: totalRevenue / totalUnits,
    cogs: totalCogs / totalUnits,
    shipping: avgShippingPerUnit,
    fees: avgFeesPerUnit,
  });

  return {
    variantId,
    title: catalog?.title?.trim() || variantId,
    currentPrice,
    currentCost,
    currency: store.currency ?? "EUR",
    totalUnitsSold: totalUnits,
    totalOrders: orderKeys.size,
    avgShippingPerUnit,
    avgFeesPerUnit,
    actualBer,
    pricePeriods: buildPeriodRows(pricePeriods, sales),
    costPeriods: buildPeriodRows(costPeriods, sales),
  };
}
