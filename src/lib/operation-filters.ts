import {
  defaultStoreOperationFromSyncStatus,
  normalizeStoreOperationStatus,
  type StoreOperationStatus,
} from "@/lib/operations-pipeline";
import { endOfDay, formatDateInput, startOfDay } from "@/lib/period";

export type StoreWithOperation = {
  operationStatus?: string | null;
  operationKilledAt?: Date | string | null;
  status?: string | null;
};

export type PeriodSliceLike = {
  start: Date;
  end: Date;
  specificDates?: string[];
};

export function resolveStoreOperationStatus(
  store: StoreWithOperation,
): StoreOperationStatus {
  return normalizeStoreOperationStatus(
    store.operationStatus ??
      defaultStoreOperationFromSyncStatus(store.status ?? "active"),
  );
}

function parseKilledAt(
  raw: Date | string | null | undefined,
): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Recorta o período até ao fim do dia em que a loja foi matada.
 * null = período inteiro posterior à matança (sem contribuição).
 */
export function clipSliceForKilledStore(
  store: StoreWithOperation,
  slice: PeriodSliceLike,
): PeriodSliceLike | null {
  if (resolveStoreOperationStatus(store) !== "killed") return slice;

  const killedAt = parseKilledAt(store.operationKilledAt) ?? startOfDay(new Date());
  const killEnd = endOfDay(killedAt);

  if (slice.specificDates?.length) {
    const keys = slice.specificDates.filter((k) => k <= formatDateInput(killEnd));
    if (!keys.length) return null;
    return { ...slice, specificDates: keys };
  }

  if (slice.start > killEnd) return null;
  const end = slice.end <= killEnd ? slice.end : killEnd;
  if (end < slice.start) return null;
  return { ...slice, end };
}

/** A loja pode aparecer no selector / consolidado para este período. */
export function storeActiveInFinancialPeriod(
  store: StoreWithOperation,
  slice: PeriodSliceLike,
): boolean {
  return clipSliceForKilledStore(store, slice) !== null;
}

/**
 * Lojas no consolidado: running + waiting + matadas (com recorte por data).
 * waiting NÃO é excluída.
 */
export function storesForFinancialConsolidated<T extends StoreWithOperation>(
  stores: T[],
): T[] {
  return stores;
}

export function countKilledExcludedFromPeriod(
  stores: StoreWithOperation[],
  slice: PeriodSliceLike,
): number {
  let n = 0;
  for (const s of stores) {
    if (
      resolveStoreOperationStatus(s) === "killed" &&
      clipSliceForKilledStore(s, slice) === null
    ) {
      n++;
    }
  }
  return n;
}

/** @deprecated usar storesForFinancialConsolidated — mantido para contagens no banner */
export function filterStoresForFinancialMetrics<T extends StoreWithOperation>(
  stores: T[],
  slice?: PeriodSliceLike,
): {
  included: T[];
  excludedWaiting: number;
  excludedKilled: number;
} {
  const included: T[] = [];
  let excludedKilled = 0;
  for (const s of stores) {
    const op = resolveStoreOperationStatus(s);
    if (op === "killed" && slice && clipSliceForKilledStore(s, slice) === null) {
      excludedKilled++;
      continue;
    }
    included.push(s);
  }
  return { included, excludedWaiting: 0, excludedKilled };
}

export function operationExclusionNote(
  excludedKilled: number,
  hasKilledWithPartialPeriod = false,
): string | null {
  if (excludedKilled > 0) {
    return `${excludedKilled} loja${excludedKilled === 1 ? "" : "s"} matada${excludedKilled === 1 ? "" : "s"} sem dados neste período (matadas antes do intervalo seleccionado).`;
  }
  if (hasKilledWithPartialPeriod) {
    return "Lojas matadas contam no consolidado só até ao dia em que foram matadas.";
  }
  return null;
}
