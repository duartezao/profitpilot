import {
  defaultStoreOperationFromSyncStatus,
  normalizeStoreOperationStatus,
  type StoreOperationStatus,
} from "@/lib/operations-pipeline";

export type StoreWithOperation = {
  operationStatus?: string | null;
  status?: string | null;
};

export function resolveStoreOperationStatus(
  store: StoreWithOperation,
): StoreOperationStatus {
  return normalizeStoreOperationStatus(
    store.operationStatus ??
      defaultStoreOperationFromSyncStatus(store.status ?? "active"),
  );
}

/** Lojas que entram no consolidado financeiro (só «a rodar»). */
export function filterStoresForFinancialMetrics<T extends StoreWithOperation>(
  stores: T[],
): {
  included: T[];
  excludedWaiting: number;
  excludedKilled: number;
} {
  const included: T[] = [];
  let excludedWaiting = 0;
  let excludedKilled = 0;
  for (const s of stores) {
    const op = resolveStoreOperationStatus(s);
    if (op === "killed") {
      excludedKilled++;
      continue;
    }
    if (op === "waiting") {
      excludedWaiting++;
      continue;
    }
    included.push(s);
  }
  return { included, excludedWaiting, excludedKilled };
}

export function operationExclusionNote(
  excludedWaiting: number,
  excludedKilled: number,
): string | null {
  const parts: string[] = [];
  if (excludedWaiting > 0) {
    parts.push(
      `${excludedWaiting} em espera`,
    );
  }
  if (excludedKilled > 0) {
    parts.push(`${excludedKilled} matada${excludedKilled === 1 ? "" : "s"}`);
  }
  if (!parts.length) return null;
  return `Consolidado financeiro exclui lojas em modo operação: ${parts.join(", ")}.`;
}
