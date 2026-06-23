/** Pipeline operacional — estados de lojas, coleções e produtos em teste. */

export type StoreOperationStatus = "running" | "waiting" | "killed";

export const STORE_OPERATION_STATUSES: StoreOperationStatus[] = [
  "running",
  "waiting",
  "killed",
];

export const STORE_OPERATION_LABEL: Record<StoreOperationStatus, string> = {
  running: "A rodar",
  waiting: "Em espera",
  killed: "Matada",
};

export const STORE_OPERATION_HINT: Record<StoreOperationStatus, string> = {
  running: "Loja activa na operação — a escalar ou a gerar dados",
  waiting: "Preparada ou pausada — ainda não está a rodar",
  killed: "Descontinuada — teste terminado sem escalar",
};

export type CollectionPipelineStatus =
  | "queue"
  | "testing"
  | "skipped"
  | "winner"
  | "failed";

export const COLLECTION_PIPELINE_STATUSES: CollectionPipelineStatus[] = [
  "queue",
  "testing",
  "skipped",
  "winner",
  "failed",
];

export const COLLECTION_PIPELINE_LABEL: Record<
  CollectionPipelineStatus,
  string
> = {
  queue: "Por testar",
  testing: "A testar",
  skipped: "Não vai testar",
  winner: "Performou",
  failed: "Matada",
};

export type ProductPipelineStatus =
  | "testing"
  | "tested"
  | "winner"
  | "failed";

export const PRODUCT_PIPELINE_STATUSES: ProductPipelineStatus[] = [
  "testing",
  "tested",
  "winner",
  "failed",
];

export const PRODUCT_PIPELINE_LABEL: Record<ProductPipelineStatus, string> = {
  testing: "A testar",
  tested: "Já testado",
  winner: "Performou",
  failed: "Falhou",
};

export function normalizeStoreOperationStatus(
  raw: string | null | undefined,
): StoreOperationStatus {
  if (raw === "waiting" || raw === "killed") return raw;
  return "running";
}

export function normalizeCollectionPipelineStatus(
  raw: string | null | undefined,
): CollectionPipelineStatus {
  if (
    raw === "testing" ||
    raw === "skipped" ||
    raw === "winner" ||
    raw === "failed"
  ) {
    return raw;
  }
  return "queue";
}

export function normalizeProductPipelineStatus(
  raw: string | null | undefined,
): ProductPipelineStatus {
  if (raw === "tested" || raw === "winner" || raw === "failed") return raw;
  return "testing";
}

export function defaultStoreOperationFromSyncStatus(
  syncStatus: string | null | undefined,
): StoreOperationStatus {
  if (syncStatus === "archived") return "killed";
  if (syncStatus === "paused") return "waiting";
  return "running";
}
