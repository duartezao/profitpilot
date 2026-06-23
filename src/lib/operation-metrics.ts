import "server-only";
import type mongoose from "mongoose";
import { aggregateAdSpendForStores } from "@/lib/ad-spend";
import {
  clipSliceForKilledStore,
  resolveStoreOperationStatus,
  type PeriodSliceLike,
  type StoreWithOperation,
} from "@/lib/operation-filters";

type StoreAgg = {
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  orders: number;
};

type StoreCogsCtx = StoreWithOperation & {
  _id: mongoose.Types.ObjectId;
  cogsMode?: string | null;
  ianaTimezone?: string | null;
};

const emptyAgg = (): StoreAgg => ({
  revenue: 0,
  cogs: 0,
  shipping: 0,
  fees: 0,
  refunds: 0,
  orders: 0,
});

function mergeAgg(into: StoreAgg, from: StoreAgg) {
  into.revenue += from.revenue;
  into.cogs += from.cogs;
  into.shipping += from.shipping;
  into.fees += from.fees;
  into.refunds += from.refunds;
  into.orders += from.orders;
}

/** Agrega com recorte por loja matada (cada loja pode ter slice efectivo diferente). */
export async function aggregateStoreAggsWithKillClip(
  wsId: mongoose.Types.ObjectId,
  stores: StoreCogsCtx[],
  slice: PeriodSliceLike,
  aggregateFn: (
    wsId: mongoose.Types.ObjectId,
    stores: StoreCogsCtx[],
    slice: PeriodSliceLike,
    sharedTz?: string | null,
  ) => Promise<Map<string, StoreAgg>>,
  sharedTz?: string | null,
): Promise<Map<string, StoreAgg>> {
  const result = new Map<string, StoreAgg>();
  if (!stores.length) return result;

  const bulk: StoreCogsCtx[] = [];
  const solo: { store: StoreCogsCtx; slice: PeriodSliceLike }[] = [];

  for (const s of stores) {
    const clipped = clipSliceForKilledStore(s, slice);
    if (clipped === null) {
      result.set(String(s._id), emptyAgg());
      continue;
    }
    if (
      resolveStoreOperationStatus(s) === "killed" ||
      clipped.end.getTime() !== slice.end.getTime() ||
      clipped.start.getTime() !== slice.start.getTime() ||
      clipped.specificDates?.length !== slice.specificDates?.length
    ) {
      solo.push({ store: s, slice: clipped });
    } else {
      bulk.push(s);
    }
  }

  if (bulk.length) {
    const bulkMap = await aggregateFn(wsId, bulk, slice, sharedTz);
    for (const [id, agg] of bulkMap) result.set(id, agg);
  }

  await Promise.all(
    solo.map(async ({ store, slice: sli }) => {
      const m = await aggregateFn(wsId, [store], sli, sharedTz);
      result.set(String(store._id), m.get(String(store._id)) ?? emptyAgg());
    }),
  );

  return result;
}

export async function aggregateAdSpendWithKillClip(
  stores: (StoreWithOperation & {
    _id: mongoose.Types.ObjectId;
    ianaTimezone?: string | null;
  })[],
  slice: PeriodSliceLike,
) {
  const byStore = new Map<string, number>();
  const entriesByStore = new Map<string, number>();

  await Promise.all(
    stores.map(async (s) => {
      const clipped = clipSliceForKilledStore(s, slice);
      const sid = String(s._id);
      if (!clipped) {
        byStore.set(sid, 0);
        entriesByStore.set(sid, 0);
        return;
      }
      const r = await aggregateAdSpendForStores([s], clipped);
      byStore.set(sid, r.byStore.get(sid) ?? 0);
      entriesByStore.set(sid, r.entriesByStore.get(sid) ?? 0);
    }),
  );

  const total = [...byStore.values()].reduce((a, b) => a + b, 0);
  return { total, byStore, entriesByStore };
}
