export type OrderSyncStoreDates = {
  lastSyncAt?: Date | null;
  importStartDate?: Date | null;
  createdAt?: Date | null;
};

const SYNC_LOOKBACK_MS = 2 * 60 * 60 * 1000;

/** Data mínima de importação de encomendas (importStartDate ou 90 dias). */
export function orderImportFloorDate(store: OrderSyncStoreDates): Date {
  return (
    store.importStartDate ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  );
}

/** Instantância desde quando importar/atualizar encomendas (com margem para refunds). */
export function orderSyncSince(store: OrderSyncStoreDates): Date {
  if (store.lastSyncAt) {
    return new Date(
      new Date(store.lastSyncAt).getTime() - SYNC_LOOKBACK_MS,
    );
  }
  return orderImportFloorDate(store);
}

/** Query Shopify: incremental por `updated_at`; primeira sync / resync total por `created_at`. */
export function orderSyncSearchQuery(
  store: OrderSyncStoreDates,
  opts?: { fullOrderResync?: boolean },
): string {
  const since = opts?.fullOrderResync
    ? orderImportFloorDate(store)
    : orderSyncSince(store);
  const incremental = Boolean(store.lastSyncAt) && !opts?.fullOrderResync;
  const base = incremental
    ? `updated_at:>=${since.toISOString()}`
    : `created_at:>=${since.toISOString()}`;
  return `${base} -financial_status:voided`;
}

export function isIncrementalOrderSync(store: OrderSyncStoreDates): boolean {
  return Boolean(store.lastSyncAt);
}
