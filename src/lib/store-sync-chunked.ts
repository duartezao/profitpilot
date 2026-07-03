import "server-only";
import { backfillOrderNetRevenueForStore } from "@/lib/order-backfill";
import { backfillOrderLinePricesForStore, ordersNeedLinePriceBackfill } from "@/lib/order-price-backfill";
import { assimilatePendingCogsForStore, assimilatePendingPricesForStore, countDistinctSoldVariants, listSoldVariantIdsForCostRefresh, listVariantIdsNeedingCostSync } from "@/lib/cogs";
import {
  assimilatesCogsOnSync,
  syncsShopifyProductCosts,
  type CogsMode,
} from "@/lib/cogs-modes";
import { connectToDatabase } from "@/lib/db";
import { enhancePayoutsError } from "@/lib/shopify-scopes";
import { syncSessionMetricsChunk } from "@/lib/session-metrics";
import { Store } from "@/models/Store";
import { applyOrderFeesFromShopify } from "@/lib/order-fees-from-shopify";
import {
  isIncrementalSync,
  orderSyncSince,
  persistStoreSyncFields,
  prepareShopifySyncContext,
  syncIncomingBalanceTransactions,
  syncOrdersPage,
  syncPayouts,
  syncSoldProductCostsPage,
} from "@/lib/shopify-sync";

export type ChunkedSyncPhase =
  | "products"
  | "orders"
  | "post_orders_backfill"
  | "post_orders_fees"
  | "payouts"
  | "sessions"
  | "done";

/** Páginas de encomendas por passo — menor para caber no timeout Vercel Hobby (~10s). */
const CHUNKED_ORDERS_PAGE_SIZE = 20;

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
    incremental: Boolean(store.lastSyncAt),
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
): string {
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
): Promise<boolean> {
  if (!syncsShopifyProductCosts(cogsMode)) return false;
  if ((await listVariantIdsNeedingCostSync(storeId, 1)).length > 0) return true;
  return (await listSoldVariantIdsForCostRefresh(storeId, null, 1)).length > 0;
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
    const incremental = isIncrementalSync(freshStore);

    if (phase === "products") {
      if (!syncsShopifyProductCosts(freshStore.cogsMode)) {
        await patchSyncState(storeId, {
          phase: "post_orders_backfill",
          progress: 84,
          message: "A finalizar encomendas…",
        });
        return getChunkedSyncStatus(storeId);
      }

      const page = await syncSoldProductCostsPage(
        freshStore,
        domain,
        accessToken,
        store.syncState.productCursor ?? null,
      );
      const productsImported =
        (store.syncState.productsImported ?? 0) + page.count;
      const soldTotal = await countDistinctSoldVariants(freshStore._id);
      const costMsg =
        soldTotal > 0
          ? `Custos Shopify: ${productsImported}/${soldTotal} variantes vendidas`
          : `Custos Shopify: ${productsImported} variantes`;

      if (page.hasMore) {
        await patchSyncState(storeId, {
          phase: "products",
          productsImported,
          productCursor: page.nextRefreshCursor,
          progress: Math.min(83, 82 + (soldTotal > 0 ? (productsImported / soldTotal) * 8 : 2)),
          message: `${costMsg}…`,
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
        productsImported,
        productCursor: null,
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
      );

      if (page.hasMore) {
        await patchSyncState(storeId, {
          phase: "orders",
          orderCursor: page.nextCursor,
          orderPagesDone: pagesDone,
          ordersImported,
          ordersUpdated,
          progress: orderProgress(pagesDone, incremental),
          message: incremental ? `${orderLabel}…` : `${orderLabel}…`,
        });
        return getChunkedSyncStatus(storeId);
      }

      const wantProductCosts = await needsSoldProductCostSync(
        freshStore._id,
        freshStore.cogsMode as CogsMode | null | undefined,
      );

      await patchSyncState(storeId, {
        phase: wantProductCosts ? "products" : "post_orders_backfill",
        orderCursor: null,
        orderPagesDone: pagesDone,
        ordersImported,
        ordersUpdated,
        progress: wantProductCosts ? (incremental ? 72 : 82) : incremental ? 78 : 84,
        message: wantProductCosts
          ? incremental
            ? "A importar custos de produtos novos…"
            : "A importar custos de produtos vendidos…"
          : incremental
            ? "A finalizar atualização…"
            : "A finalizar encomendas…",
        productsImported: 0,
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "post_orders_backfill") {
      if (!incremental) {
        await backfillOrderNetRevenueForStore(freshStore._id);
      }
      if (await ordersNeedLinePriceBackfill(freshStore._id)) {
        await backfillOrderLinePricesForStore(
          freshStore._id,
          domain,
          accessToken,
        );
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
      const feeSince = freshStore.lastSyncAt
        ? orderSyncSince(freshStore)
        : null;
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
        const incremental = isIncrementalSync(freshStore);
        payouts = await syncPayouts(freshStore, domain, accessToken, {
          maxPages: incremental ? 2 : 6,
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
      );
      const products = store.syncState.productsImported ?? 0;
      const productPart =
        products > 0 ? ` · ${products} custo${products === 1 ? "" : "s"} novos` : "";

      const summary = incremental
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
        message: incremental ? "Atualização concluída" : "Concluído",
        sessionDaysSynced: sessionDays,
        resultSummary: summary,
        ordersImported: 0,
        ordersUpdated: 0,
        error: null,
        orderCursor: null,
        productCursor: null,
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
