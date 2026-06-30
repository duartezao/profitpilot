import "server-only";
import { backfillOrderNetRevenueForStore } from "@/lib/order-backfill";
import { backfillOrderLinePricesForStore, ordersNeedLinePriceBackfill } from "@/lib/order-price-backfill";
import { assimilatePendingCogsForStore } from "@/lib/cogs";
import {
  assimilatesCogsOnSync,
  syncsShopifyProductCosts,
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
  syncProductCostsPage,
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
  orderPagesDone: number;
  productsImported: number;
  payoutsImported: number;
  balanceTransactionsImported: number;
  sessionDaysSynced: number;
  error: string | null;
  resultSummary: string | null;
  continue: boolean;
};

const STALE_MS = 3 * 60 * 1000;

function orderProgress(pagesDone: number): number {
  return Math.min(82, 10 + pagesDone * 1.2);
}

function readSyncStatus(store: {
  syncState?: {
    status?: string;
    phase?: string | null;
    progress?: number;
    message?: string;
    ordersImported?: number;
    orderPagesDone?: number;
    productsImported?: number;
    payoutsImported?: number;
    balanceTransactionsImported?: number;
    sessionDaysSynced?: number;
    error?: string | null;
    resultSummary?: string | null;
    updatedAt?: Date | null;
  };
}): ChunkedSyncStatus {
  const s = store.syncState ?? { status: "idle" };
  const status = (s.status ?? "idle") as ChunkedSyncStatus["status"];
  return {
    status,
    phase: (s.phase as ChunkedSyncPhase | null) ?? null,
    progress: s.progress ?? 0,
    message: s.message ?? "",
    ordersImported: s.ordersImported ?? 0,
    orderPagesDone: s.orderPagesDone ?? 0,
    productsImported: s.productsImported ?? 0,
    payoutsImported: s.payoutsImported ?? 0,
    balanceTransactionsImported: s.balanceTransactionsImported ?? 0,
    sessionDaysSynced: s.sessionDaysSynced ?? 0,
    error: s.error ?? null,
    resultSummary: s.resultSummary ?? null,
    continue: status === "running",
  };
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
  const store = await Store.findById(storeId).select("syncState").lean();
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

/** Inicia sync em passos: produtos + estado para encomendas paginadas. */
export async function startChunkedSync(storeId: string): Promise<ChunkedSyncStatus> {
  await connectToDatabase();
  const existing = await Store.findById(storeId);
  if (!existing) throw new Error("Loja não encontrada.");

  if (existing.syncState?.status === "running" && !isStaleRunning(existing)) {
    return readSyncStatus(existing);
  }

  const skipProducts = !syncsShopifyProductCosts(existing.cogsMode);
  const startedAt = new Date();
  await patchSyncState(storeId, {
    status: "running",
    phase: skipProducts ? "orders" : "products",
    progress: 2,
    message: "A ligar à Shopify…",
    orderCursor: null,
    productCursor: null,
    sessionRangeIndex: 0,
    orderPagesDone: 0,
    ordersImported: 0,
    productsImported: 0,
    payoutsImported: 0,
    balanceTransactionsImported: 0,
    sessionDaysSynced: 0,
    error: null,
    resultSummary: null,
    startedAt,
  });

  try {
    const { store } = await prepareShopifySyncContext(storeId);
    const skipProducts = !syncsShopifyProductCosts(store.cogsMode);

    await patchSyncState(storeId, {
      phase: skipProducts ? "orders" : "products",
      progress: skipProducts ? 10 : 5,
      message: skipProducts
        ? "A importar encomendas…"
        : "A importar custos de produtos…",
      productsImported: 0,
      orderCursor: null,
      orderPagesDone: 0,
      ordersImported: 0,
    });

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
  if (isStaleRunning(store)) {
    await patchSyncState(storeId, {
      status: "error",
      error: "Sync interrompido (timeout). Clica novamente para recomeçar.",
    });
    return getChunkedSyncStatus(storeId);
  }

  const phase = store.syncState.phase as ChunkedSyncPhase | null;

  try {
    const { store: freshStore, domain, accessToken } =
      await prepareShopifySyncContext(storeId);

    if (phase === "products") {
      if (!syncsShopifyProductCosts(freshStore.cogsMode)) {
        await patchSyncState(storeId, {
          phase: "orders",
          progress: 10,
          message: "A importar encomendas…",
          productsImported: 0,
          productCursor: null,
          orderCursor: null,
          orderPagesDone: 0,
          ordersImported: 0,
        });
        return getChunkedSyncStatus(storeId);
      }

      const productCursor = store.syncState.productCursor ?? null;
      const page = await syncProductCostsPage(
        freshStore,
        domain,
        accessToken,
        productCursor,
      );
      const productsImported =
        (store.syncState.productsImported ?? 0) + page.count;

      if (page.hasMore) {
        await patchSyncState(storeId, {
          phase: "products",
          productCursor: page.nextCursor,
          productsImported,
          progress: Math.min(9, 3 + productsImported / 50),
          message: `${productsImported} variantes importadas…`,
        });
        return getChunkedSyncStatus(storeId);
      }

      if (assimilatesCogsOnSync(freshStore.cogsMode)) {
        await assimilatePendingCogsForStore(freshStore._id);
      }

      await patchSyncState(storeId, {
        phase: "orders",
        progress: 10,
        message: "A importar encomendas…",
        productsImported,
        productCursor: null,
        orderCursor: null,
        orderPagesDone: 0,
        ordersImported: 0,
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
        (store.syncState.ordersImported ?? 0) + page.imported;

      if (page.hasMore) {
        await patchSyncState(storeId, {
          phase: "orders",
          orderCursor: page.nextCursor,
          orderPagesDone: pagesDone,
          ordersImported,
          progress: orderProgress(pagesDone),
          message: `${ordersImported} encomendas importadas…`,
        });
        return getChunkedSyncStatus(storeId);
      }

      await patchSyncState(storeId, {
        phase: "post_orders_backfill",
        orderCursor: null,
        orderPagesDone: pagesDone,
        ordersImported,
        progress: 84,
        message: "A finalizar encomendas…",
      });
      return getChunkedSyncStatus(storeId);
    }

    if (phase === "post_orders_backfill") {
      await backfillOrderNetRevenueForStore(freshStore._id);
      if (await ordersNeedLinePriceBackfill(freshStore._id)) {
        await backfillOrderLinePricesForStore(
          freshStore._id,
          domain,
          accessToken,
        );
      }
      if (assimilatesCogsOnSync(freshStore.cogsMode)) {
        await assimilatePendingCogsForStore(freshStore._id);
      }

      await patchSyncState(storeId, {
        phase: "post_orders_fees",
        progress: 85,
        message: "A calcular taxas…",
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
        message: `A importar payouts…${feesMessage}`,
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
        progress: 92,
        message: "A importar sessões…",
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

      const orders = store.syncState.ordersImported ?? 0;
      const products = store.syncState.productsImported ?? 0;
      const payouts = store.syncState.payoutsImported ?? 0;
      const balance = store.syncState.balanceTransactionsImported ?? 0;
      const payoutsErr = freshStore.payoutsError ?? undefined;

      const sessionPart = sessionError
        ? `sessões: erro — ${sessionError}`
        : `${sessionDays} dia${sessionDays === 1 ? "" : "s"} de sessões`;

      const summary = payoutsErr
        ? `${orders} orders · ${products} produtos · ${sessionPart} · payouts: ${payoutsErr}`
        : `${orders} orders · ${products} produtos · ${sessionPart} · ${payouts} payouts · ${balance} pendentes`;

      await persistStoreSyncFields(freshStore._id, {
        lastSyncAt: new Date(),
        lastSyncError: null,
        lastSessionMetricsError: freshStore.lastSessionMetricsError ?? null,
      });

      await patchSyncState(storeId, {
        status: "done",
        phase: "done",
        progress: 100,
        message: "Concluído",
        sessionDaysSynced: sessionDays,
        resultSummary: summary,
        error: null,
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
