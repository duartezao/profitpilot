import "server-only";
import { backfillOrderNetRevenueForStore } from "@/lib/order-backfill";
import { backfillOrderLinePricesForStore, ordersNeedLinePriceBackfill } from "@/lib/order-price-backfill";
import { assimilatePendingCogsForStore, assimilatePendingPricesForStore, countDistinctSoldVariants, filterVariantIdsNeedingCostSync, listVariantIdsNeedingCostSync } from "@/lib/cogs";
import {
  assimilatesCogsOnSync,
  syncsShopifyProductCosts,
  type CogsMode,
} from "@/lib/cogs-modes";
import { connectToDatabase } from "@/lib/db";
import {
  prepareStoreOrdersFullResync,
  restoreStoreOrdersResyncManualCogs,
  type OrdersResyncManualCogsMap,
} from "@/lib/store-orders-resync";
import { enhancePayoutsError } from "@/lib/shopify-scopes";
import { syncSessionMetricsChunk } from "@/lib/session-metrics";
import { Store } from "@/models/Store";
import { applyOrderFeesFromShopify } from "@/lib/order-fees-from-shopify";
import {
  isIncrementalSync,
  orderImportFloorDate,
  orderSyncSince,
  persistStoreSyncFields,
  prepareShopifySyncContext,
  syncIncomingBalanceTransactions,
  syncOrdersPage,
  syncPayouts,
  syncSoldProductCostsPage,
  backfillOrderShippingCountriesForStore,
} from "@/lib/shopify-sync";

export type ChunkedSyncPhase =
  | "products"
  | "orders"
  | "post_orders_backfill"
  | "post_orders_fees"
  | "payouts"
  | "sessions"
  | "done";

/** Lote na fase products do sync UI (Vercel Pro — maxDuration 300 s). */
const CHUNKED_SOLD_VARIANT_BATCH = 50;

/** Encomendas por passo no sync manual (Vercel Pro — maxDuration 300 s). */
const CHUNKED_ORDERS_PAGE_SIZE = 50;

export type ChunkedSyncStatus = {
  status: "idle" | "running" | "done" | "error";
  phase: ChunkedSyncPhase | null;
  progress: number;
  message: string;
  ordersImported: number;
  ordersUpdated: number;
  orderPagesDone: number;
  productsImported: number;
  payoutsImported: number;
  balanceTransactionsImported: number;
  sessionDaysSynced: number;
  error: string | null;
  resultSummary: string | null;
  continue: boolean;
  /** true = só delta desde a última sync concluída */
  incremental?: boolean;
  /** true = reimportação total de encomendas em curso */
  ordersFullResync?: boolean;
};

const STALE_MS = 10 * 60 * 1000;

function readSyncStatus(
  store: {
    lastSyncAt?: Date | null;
    syncState?: {
      status?: string;
      phase?: string | null;
      progress?: number;
      message?: string;
      ordersImported?: number;
      ordersUpdated?: number;
      orderPagesDone?: number;
      productsImported?: number;
      payoutsImported?: number;
      balanceTransactionsImported?: number;
      sessionDaysSynced?: number;
      error?: string | null;
      resultSummary?: string | null;
      updatedAt?: Date | null;
      fullOrderResync?: boolean;
      ordersResyncManualCogs?: OrdersResyncManualCogsMap | null;
    };
  },
): ChunkedSyncStatus {
  const s = store.syncState ?? { status: "idle" };
  const status = (s.status ?? "idle") as ChunkedSyncStatus["status"];
  return {
    status,
    phase: (s.phase as ChunkedSyncPhase | null) ?? null,
    progress: s.progress ?? 0,
    message: s.message ?? "",
    ordersImported: s.ordersImported ?? 0,
    ordersUpdated: s.ordersUpdated ?? 0,
    orderPagesDone: s.orderPagesDone ?? 0,
    productsImported: s.productsImported ?? 0,
    payoutsImported: s.payoutsImported ?? 0,
    balanceTransactionsImported: s.balanceTransactionsImported ?? 0,
    sessionDaysSynced: s.sessionDaysSynced ?? 0,
    error: s.error ?? null,
    resultSummary: s.resultSummary ?? null,
    continue: status === "running",
    incremental: Boolean(store.lastSyncAt) && !s.fullOrderResync,
    ordersFullResync: Boolean(s.fullOrderResync),
  };
}

function canResumeInitialSync(store: {
  lastSyncAt?: Date | null;
  syncState?: {
    status?: string;
    phase?: string | null;
    orderCursor?: string | null;
    ordersImported?: number;
    orderPagesDone?: number;
    updatedAt?: Date | null;
  };
}): boolean {
  if (store.lastSyncAt) return false;
  const s = store.syncState;
  if (!s?.phase || s.phase === "done") return false;
  if (s.status === "running" && !isStaleRunning(store)) return false;
  const started =
    Boolean(s.orderCursor) ||
    (s.ordersImported ?? 0) > 0 ||
    (s.orderPagesDone ?? 0) > 0 ||
    (s.phase !== "orders" && s.phase !== "done");
  return (
    started &&
    (s.status === "error" || s.status === "running" || isStaleRunning(store))
  );
}

/** Retoma sync interrompido (timeout/erro) a meio — ex. fase custos a 73%. */
function canResumeInterruptedSync(store: {
  lastSyncAt?: Date | null;
  syncState?: {
    status?: string;
    phase?: string | null;
    message?: string;
  };
}): boolean {
  const s = store.syncState;
  if (!s?.phase || s.phase === "done") return false;
  if (s.status === "error") return true;
  if (s.status === "running" && isStaleRunning(store)) return true;
  return false;
}

function resumeSyncMessage(phase: string | null | undefined): string {
  if (phase === "products") return "A retomar custos (cor/tamanho)…";
  if (phase === "orders") return "A retomar encomendas…";
  if (phase === "sessions") return "A retomar sessões…";
  return "A retomar sincronização…";
}

async function touchSyncHeartbeat(storeId: string): Promise<void> {
  await Store.updateOne(
    { _id: storeId },
    { $set: { "syncState.updatedAt": new Date() } },
  );
}

function formatOrderSyncLabel(
  inserted: number,
  updated: number,
  incremental: boolean,
  ordersFullResync = false,
): string {
  if (ordersFullResync) {
    const total = inserted + updated;
    return `${total} encomenda${total === 1 ? "" : "s"} reimportada${total === 1 ? "" : "s"}`;
  }
  if (inserted === 0 && updated === 0) {
    return "Sem alterações nas encomendas";
  }
  if (incremental) {
    if (inserted === 0) {
      return `${updated} encomenda${updated === 1 ? "" : "s"} actualizada${updated === 1 ? "" : "s"}`;
    }
    if (updated === 0) {
      return `${inserted} encomenda${inserted === 1 ? "" : "s"} nova${inserted === 1 ? "" : "s"}`;
    }
    return `${inserted} nova${inserted === 1 ? "" : "s"} · ${updated} actualizada${updated === 1 ? "" : "s"}`;
  }
  const total = inserted + updated;
  return `${total} encomenda${total === 1 ? "" : "s"} importada${total === 1 ? "" : "s"}`;
}

function orderProgress(pagesDone: number, incremental: boolean): number {
  if (incremental) {
    return Math.min(70, 15 + pagesDone * 8);
  }
  return Math.min(82, 10 + pagesDone * 1.2);
}

async function needsSoldProductCostSync(
  storeId: import("mongoose").Types.ObjectId,
  cogsMode: CogsMode | null | undefined,
  incremental: boolean,
  pendingVariantIds?: string[],
): Promise<boolean> {
  if (!syncsShopifyProductCosts(cogsMode)) return false;
  if (incremental) {
    if (!pendingVariantIds?.length) return false;
    const { ids } = await filterVariantIdsNeedingCostSync(
      storeId,
      pendingVariantIds,
      1,
    );
    return ids.length > 0;
  }
  if ((await listVariantIdsNeedingCostSync(storeId, 1)).length > 0) return true;
  const sold = await countDistinctSoldVariants(storeId);
  return sold > 0;
}

function formatCostSyncMessage(
  mode: "new" | "refresh" | "none",
  incremental: boolean,
  checked: number,
  total: number,
  batchCount: number,
): string {
  if (mode === "new") {
    return total > 0
      ? `Custos novos (cor/tamanho) — ${checked}/${total}…`
      : "Custos novos (cor/tamanho)…";
  }
  if (incremental) {
    return batchCount > 0
      ? `A rever custos (cor/tamanho) — ${batchCount} variantes`
      : "Custos em dia";
  }
  return total > 0
    ? `Custos Shopify: ${checked}/${total} (cor/tamanho)…`
    : "Custos Shopify…";
}

function isStaleRunning(store: {
  syncState?: { status?: string; updatedAt?: Date | null };
}): boolean {
  if (store.syncState?.status !== "running") return false;
  const updated = store.syncState.updatedAt;
  if (!updated) return true;
  return Date.now() - new Date(updated).getTime() > STALE_MS;
}

async function patchSyncState(
  storeId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await Store.updateOne(
    { _id: storeId },
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [`syncState.${k}`, v]),
        ),
        "syncState.updatedAt": now,
      },
    },
  );
}

export async function getChunkedSyncStatus(
  storeId: string,
): Promise<ChunkedSyncStatus> {
  await connectToDatabase();
  const store = await Store.findById(storeId)
    .select("syncState lastSyncAt")
    .lean();
  if (!store) throw new Error("Loja não encontrada.");
  return readSyncStatus(store);
}

export async function cancelChunkedSync(storeId: string): Promise<ChunkedSyncStatus> {
  await connectToDatabase();
  await patchSyncState(storeId, {
    status: "idle",
    phase: null,
    progress: 0,
    message: "",
    orderCursor: null,
    error: null,
  });
  return getChunkedSyncStatus(storeId);
}

/** Inicia sync: retoma importação interrompida, atualização incremental ou importação inicial. */
export async function startChunkedSync(storeId: string): Promise<ChunkedSyncStatus> {
  await connectToDatabase();
  const existing = await Store.findById(storeId);
  if (!existing) throw new Error("Loja não encontrada.");

  if (existing.syncState?.status === "running" && !isStaleRunning(existing)) {
    return readSyncStatus(existing);
  }

  if (canResumeInterruptedSync(existing)) {
    const phase = existing.syncState?.phase;
    await patchSyncState(storeId, {
      status: "running",
      message: resumeSyncMessage(phase),
      error: null,
    });
    return getChunkedSyncStatus(storeId);
  }

  if (canResumeInitialSync(existing)) {
    await patchSyncState(storeId, {
      status: "running",
      message: "A retomar importação onde parou…",
      error: null,
    });
    return getChunkedSyncStatus(storeId);
  }

  const incremental = isIncrementalSync(existing);
  const startedAt = new Date();
  await patchSyncState(storeId, {
    status: "running",
    phase: "orders",
    progress: incremental ? 12 : 2,
    message: incremental
      ? "A buscar encomendas novas ou alteradas…"
      : "Importação inicial — encomendas…",
    orderCursor: null,
    productCursor: null,
    productRefreshOffset: 0,
    pendingCostVariantIds: [],
    pendingCostVariantOffset: 0,
    sessionRangeIndex: 0,
    orderPagesDone: 0,
    ordersImported: 0,
    ordersUpdated: 0,
    productsImported: 0,
    payoutsImported: 0,
    balanceTransactionsImported: 0,
    sessionDaysSynced: 0,
    error: null,
    resultSummary: null,
    startedAt,
  });

  try {
    await prepareShopifySyncContext(storeId);
    return getChunkedSyncStatus(storeId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao iniciar sync.";
    await patchSyncState(storeId, {
      status: "error",
      phase: null,
      progress: 0,
      message: "",
      error: msg,
    });
    await Store.updateOne({ _id: storeId }, { $set: { lastSyncError: msg } });
    return getChunkedSyncStatus(storeId);
  }
}

/** Reimporta todas as encomendas desde importStartDate; mantém COGS, ads e sessões. */
export async function startChunkedOrdersFullResync(
  storeId: string,
): Promise<ChunkedSyncStatus> {
  await connectToDatabase();
  const existing = await Store.findById(storeId);
  if (!existing) throw new Error("Loja não encontrada.");

  if (existing.syncState?.status === "running" && !isStaleRunning(existing)) {
    return readSyncStatus(existing);
  }

  const { deletedCount, manualCogsMap } =
    await prepareStoreOrdersFullResync(storeId);

  const startedAt = new Date();
  await patchSyncState(storeId, {
    status: "running",
    phase: "orders",
    progress: 5,
    message:
      deletedCount > 0
        ? `A reimportar ${deletedCount} encomenda${deletedCount === 1 ? "" : "s"}…`
        : "A reimportar encomendas…",
    fullOrderResync: true,
    ordersResyncManualCogs: manualCogsMap,
    orderCursor: null,
    productCursor: null,
    productRefreshOffset: 0,
    pendingCostVariantIds: [],
    pendingCostVariantOffset: 0,
    sessionRangeIndex: 0,
    orderPagesDone: 0,
    ordersImported: 0,
    ordersUpdated: 0,
    productsImported: 0,
    payoutsImported: 0,
    balanceTransactionsImported: 0,
    sessionDaysSynced: 0,
    error: null,
    resultSummary: null,
    startedAt,
  });

  try {
    await prepareShopifySyncContext(storeId);
    return getChunkedSyncStatus(storeId);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Falha ao iniciar reimportação.";
    await patchSyncState(storeId, {
      status: "error",
      phase: null,
      progress: 0,
      message: "",
      error: msg,
      fullOrderResync: false,
      ordersResyncManualCogs: null,
    });
    await Store.updateOne({ _id: storeId }, { $set: { lastSyncError: msg } });
    return getChunkedSyncStatus(storeId);
  }
}

/** Um passo do sync — tipicamente uma página de encomendas ou uma fase curta. */
export async function runChunkedSyncStep(
  storeId: string,
): Promise<ChunkedSyncStatus> {
  await connectToDatabase();
  const store = await Store.findById(storeId);
  if (!store) throw new Error("Loja não encontrada.");

  if (store.syncState?.status !== "running") {
    return readSyncStatus(store);
  }

  await touchSyncHeartbeat(storeId);

  const phase = store.syncState.phase as ChunkedSyncPhase | null;

  try {
    const { store: freshStore, domain, accessToken } =
      await prepareShopifySyncContext(storeId);
    const ordersFullResync = Boolean(store.syncState?.fullOrderResync);
    const incremental = isIncrementalSync(freshStore) && !ordersFullResync;

    if (phase === "products") {
      if (!syncsShopifyProductCosts(freshStore.cogsMode)) {
        await patchSyncState(storeId, {
          phase: "post_orders_backfill",
          progress: 84,
          message: "A finalizar encomendas…",
        });
        return getChunkedSyncStatus(storeId);
      }

      const refreshOffset = store.syncState.productRefreshOffset ?? 0;
      const pendingIds = store.syncState.pendingCostVariantIds ?? [];
      const pendingOffset = store.syncState.pendingCostVariantOffset ?? 0;
      const prevProductsImported = store.syncState.productsImported ?? 0;
      const usePendingRestrict = incremental && pendingIds.length > 0;
      const page = await syncSoldProductCostsPage(
        freshStore,
        domain,
        accessToken,
        {
          refreshOffset,
          incremental,
          deferAssimilate: true,
          batchSize: CHUNKED_SOLD_VARIANT_BATCH,
          ...(usePendingRestrict
            ? {
                restrictVariantIds: pendingIds,
                restrictOffset: pendingOffset,
              }
            : {}),
        },
      );

      let costTotal: number;
      let variantsChecked: number;
      if (usePendingRestrict) {
        costTotal = page.pendingTotal ?? pendingIds.length;
        variantsChecked = page.pendingDone ?? pendingOffset + page.count;
      } else {
        const soldTotal = await countDistinctSoldVariants(freshStore._id);
        costTotal = soldTotal;
        variantsChecked =
          page.mode === "new"
            ? prevProductsImported + page.count
            : page.mode === "refresh" && !incremental
              ? page.nextRefreshOffset
              : prevProductsImported + page.count;
        variantsChecked = Math.min(variantsChecked, soldTotal);
      }

      const costMsg = formatCostSyncMessage(
        page.mode,
        incremental,
        variantsChecked,
        costTotal,
        page.count,
      );

      if (page.hasMore) {
        await patchSyncState(storeId, {
          phase: "products",
          productsImported: variantsChecked,
          productRefreshOffset: usePendingRestrict ? 0 : page.nextRefreshOffset,
          pendingCostVariantOffset: usePendingRestrict
            ? page.nextRefreshOffset
            : 0,
          progress: Math.min(
            83,
            costTotal > 0
              ? 72 + (variantsChecked / costTotal) * 11
              : 80,
          ),
          message: costMsg,
        });
        return getChunkedSyncStatus(storeId);
      }

      if (assimilatesCogsOnSync(freshStore.cogsMode)) {
        await assimilatePendingCogsForStore(freshStore._id);
      }
      await assimilatePendingPricesForStore(freshStore._id);

      await patchSyncState(storeId, {
        phase: "post_orders_backfill",
        progress: 84,
        message: "A finalizar encomendas…",
        productsImported: variantsChecked,
        productRefreshOffset: 0,
        pendingCostVariantIds: [],
        pendingCostVariantOffset: 0,
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "orders") {
      const cursor = store.syncState.orderCursor ?? null;
      const page = await syncOrdersPage(
        freshStore,
        domain,
        accessToken,
        cursor,
        CHUNKED_ORDERS_PAGE_SIZE,
        { fullOrderResync: ordersFullResync },
      );

      const pagesDone = (store.syncState.orderPagesDone ?? 0) + 1;
      const ordersImported =
        (store.syncState.ordersImported ?? 0) + page.inserted;
      const ordersUpdated =
        (store.syncState.ordersUpdated ?? 0) + page.updated;
      const orderLabel = formatOrderSyncLabel(
        ordersImported,
        ordersUpdated,
        incremental,
        ordersFullResync,
      );

      const pending = new Set(store.syncState.pendingCostVariantIds ?? []);
      for (const id of page.newOrderVariantIds) pending.add(id);
      const pendingList = [...pending];

      if (page.hasMore) {
        await patchSyncState(storeId, {
          phase: "orders",
          orderCursor: page.nextCursor,
          orderPagesDone: pagesDone,
          ordersImported,
          ordersUpdated,
          pendingCostVariantIds: pendingList,
          progress: orderProgress(pagesDone, incremental && !ordersFullResync),
          message: ordersFullResync
            ? `${orderLabel}…`
            : incremental
              ? `${orderLabel}…`
              : `${orderLabel}…`,
        });
        return getChunkedSyncStatus(storeId);
      }

      const wantProductCosts = await needsSoldProductCostSync(
        freshStore._id,
        freshStore.cogsMode as CogsMode | null | undefined,
        incremental && !ordersFullResync,
        pendingList,
      );

      if (ordersFullResync) {
        await restoreStoreOrdersResyncManualCogs(
          storeId,
          store.syncState?.ordersResyncManualCogs as OrdersResyncManualCogsMap | null,
        );
      }

      await patchSyncState(storeId, {
        phase: wantProductCosts ? "products" : "post_orders_backfill",
        orderCursor: null,
        orderPagesDone: pagesDone,
        ordersImported,
        ordersUpdated,
        progress: wantProductCosts
          ? ordersFullResync
            ? 72
            : incremental
              ? 72
              : 82
          : ordersFullResync
            ? 78
            : incremental
              ? 78
              : 84,
        message: ordersFullResync
          ? "Encomendas reimportadas — a finalizar…"
          : wantProductCosts
            ? incremental
              ? "A verificar custos novos (cor/tamanho)…"
              : "A importar custos vendidos (cor/tamanho)…"
            : incremental
              ? "A finalizar atualização…"
              : "A finalizar encomendas…",
        productsImported: 0,
        productRefreshOffset: 0,
        pendingCostVariantIds: pendingList,
        pendingCostVariantOffset: 0,
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "post_orders_backfill") {
      if (!incremental || ordersFullResync) {
        await backfillOrderNetRevenueForStore(freshStore._id);
      }
      if (await ordersNeedLinePriceBackfill(freshStore._id)) {
        await backfillOrderLinePricesForStore(
          freshStore._id,
          domain,
          accessToken,
        );
      }
      if (syncsShopifyProductCosts(freshStore.cogsMode)) {
        for (let batch = 0; batch < 8; batch++) {
          const r = await backfillOrderShippingCountriesForStore(
            freshStore,
            domain,
            accessToken,
          );
          if (r.remaining <= 0) break;
        }
      }
      if (
        assimilatesCogsOnSync(freshStore.cogsMode) &&
        !syncsShopifyProductCosts(freshStore.cogsMode)
      ) {
        await assimilatePendingCogsForStore(freshStore._id);
      }
      await assimilatePendingPricesForStore(freshStore._id);

      await patchSyncState(storeId, {
        phase: "post_orders_fees",
        progress: incremental ? 82 : 85,
        message: incremental ? "A atualizar taxas…" : "A calcular taxas…",
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "post_orders_fees") {
      const feeSince =
        ordersFullResync || !freshStore.lastSyncAt
          ? orderImportFloorDate(freshStore)
          : orderSyncSince(freshStore);
      let feesMessage = "";
      try {
        const fees = await applyOrderFeesFromShopify(
          freshStore,
          domain,
          accessToken,
          { since: feeSince },
        );
        feesMessage =
          fees.real > 0
            ? ` · taxas: ${fees.real} reais, ${fees.estimated} estimadas`
            : "";
      } catch (e) {
        console.error("[sync] order fees", e);
      }

      await patchSyncState(storeId, {
        phase: "payouts",
        progress: 86,
        message: incremental
          ? `A atualizar payouts…${feesMessage}`
          : `A importar payouts…${feesMessage}`,
        sessionRangeIndex: 0,
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "payouts") {
      let payouts = 0;
      let balanceTransactions = 0;
      let payoutsError: string | undefined;

      try {
        const lightPayoutSync =
          isIncrementalSync(freshStore) || ordersFullResync;
        payouts = await syncPayouts(freshStore, domain, accessToken, {
          maxPages: lightPayoutSync ? 2 : 6,
        });
        balanceTransactions = await syncIncomingBalanceTransactions(
          freshStore,
          domain,
          accessToken,
        );
        freshStore.payoutsError = null;
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Falha a obter payouts.";
        payoutsError = enhancePayoutsError(raw);
        freshStore.payoutsError = payoutsError;
      }
      await persistStoreSyncFields(freshStore._id, {
        payoutsError: freshStore.payoutsError ?? null,
        ...(freshStore.paymentsBalanceUpdatedAt
          ? {
              paymentsBalance: freshStore.paymentsBalance,
              paymentsBalanceUpdatedAt: freshStore.paymentsBalanceUpdatedAt,
            }
          : {}),
      });

      await patchSyncState(storeId, {
        phase: "sessions",
        progress: incremental ? 90 : 92,
        message: incremental ? "A atualizar sessões…" : "A importar sessões…",
        payoutsImported: payouts,
        balanceTransactionsImported: balanceTransactions,
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "sessions") {
      const rangeIndex = store.syncState.sessionRangeIndex ?? 0;
      let sessionDays = store.syncState.sessionDaysSynced ?? 0;
      let sessionError: string | undefined;
      try {
        const chunk = await syncSessionMetricsChunk(storeId, rangeIndex);
        sessionDays += chunk.synced;
        if (!chunk.done) {
          await patchSyncState(storeId, {
            phase: "sessions",
            sessionRangeIndex: chunk.nextRangeIndex,
            sessionDaysSynced: sessionDays,
            progress: Math.min(98, 92 + chunk.nextRangeIndex * 2),
            message: `Sessões (${chunk.nextRangeIndex}/${chunk.totalRanges})…`,
          });
          return getChunkedSyncStatus(storeId);
        }
        freshStore.lastSessionMetricsError = null;
      } catch (e) {
        sessionError =
          e instanceof Error ? e.message : "Falha a obter sessões Shopify.";
        freshStore.lastSessionMetricsError = sessionError;
      }

      const latest = await Store.findById(storeId).select("syncState").lean();
      const syncCounts = latest?.syncState ?? store.syncState;
      const ordersInserted = syncCounts?.ordersImported ?? 0;
      const ordersUpdated = syncCounts?.ordersUpdated ?? 0;
      const payouts = store.syncState.payoutsImported ?? 0;
      const balance = store.syncState.balanceTransactionsImported ?? 0;
      const payoutsErr = freshStore.payoutsError ?? undefined;

      const sessionPart = sessionError
        ? `sessões: erro — ${sessionError}`
        : sessionDays > 0
          ? `${sessionDays} dia${sessionDays === 1 ? "" : "s"} de sessões`
          : "sessões em dia";

      const orderPart = formatOrderSyncLabel(
        ordersInserted,
        ordersUpdated,
        incremental,
        ordersFullResync,
      );
      const products = store.syncState.productsImported ?? 0;
      const productPart =
        products > 0 ? ` · ${products} custo${products === 1 ? "" : "s"} novos` : "";

      const summary = ordersFullResync
        ? `Reimportação · ${orderPart}${productPart} · ${sessionPart}`
        : incremental
          ? payoutsErr
            ? `Atualizado · ${orderPart}${productPart} · ${sessionPart} · payouts: ${payoutsErr}`
            : `Atualizado · ${orderPart}${productPart} · ${sessionPart}`
          : payoutsErr
            ? `${orderPart} · ${products} produtos · ${sessionPart} · payouts: ${payoutsErr}`
            : `${orderPart} · ${products} produtos · ${sessionPart} · ${payouts} payouts · ${balance} pendentes`;

      await persistStoreSyncFields(freshStore._id, {
        lastSyncAt: new Date(),
        lastSyncError: null,
        lastSessionMetricsError: freshStore.lastSessionMetricsError ?? null,
      });

      await patchSyncState(storeId, {
        status: "done",
        phase: "done",
        progress: 100,
        message: ordersFullResync
          ? "Reimportação concluída"
          : incremental
            ? "Atualização concluída"
            : "Concluído",
        sessionDaysSynced: sessionDays,
        resultSummary: summary,
        ordersImported: 0,
        ordersUpdated: 0,
        error: null,
        orderCursor: null,
        productCursor: null,
        fullOrderResync: false,
        ordersResyncManualCogs: null,
      });

      return getChunkedSyncStatus(storeId);
    }

    return readSyncStatus(store);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na sincronização.";
    await patchSyncState(storeId, {
      status: "error",
      phase: null,
      progress: store.syncState?.progress ?? 0,
      message: "",
      error: msg,
    });
    await Store.updateOne({ _id: storeId }, { $set: { lastSyncError: msg } });
    return getChunkedSyncStatus(storeId);
  }
}
