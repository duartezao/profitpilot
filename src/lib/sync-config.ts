/** Intervalo global de sync automático (todas as lojas / todos os workspaces). */
export const DEFAULT_GLOBAL_SYNC_INTERVAL_MINUTES = 120;

export function getGlobalSyncIntervalMinutes(): number {
  const raw = Number(
    process.env.GLOBAL_SYNC_INTERVAL_MINUTES ??
      DEFAULT_GLOBAL_SYNC_INTERVAL_MINUTES,
  );
  if (!Number.isFinite(raw) || raw < 60) {
    return DEFAULT_GLOBAL_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(raw, 24 * 60);
}

export function formatGlobalSyncInterval(): string {
  const minutes = getGlobalSyncIntervalMinutes();
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return `${minutes} min`;
}
