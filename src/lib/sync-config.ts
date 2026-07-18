/** Intervalo global de sync automático Shopify (todas as lojas). */
export const DEFAULT_GLOBAL_SYNC_INTERVAL_MINUTES = 30;

/** Mínimo seguro — sync incremental; evita martelar a API. */
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 24 * 60;

export function getGlobalSyncIntervalMinutes(): number {
  const raw = Number(
    process.env.GLOBAL_SYNC_INTERVAL_MINUTES ??
      DEFAULT_GLOBAL_SYNC_INTERVAL_MINUTES,
  );
  if (!Number.isFinite(raw) || raw < MIN_INTERVAL_MINUTES) {
    return DEFAULT_GLOBAL_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(raw, MAX_INTERVAL_MINUTES);
}

export function formatGlobalSyncInterval(): string {
  const minutes = getGlobalSyncIntervalMinutes();
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return `${minutes} min`;
}
