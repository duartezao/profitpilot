/** Leitura rápida da BD no cliente (sem chamar APIs externas). */
export const LIVE_DATA_POLL_MS = 60 * 1000;

/** Intervalo mínimo entre syncs automáticos de ads (cron Vercel). */
export const DEFAULT_AD_CRON_SYNC_INTERVAL_MINUTES = 30;

const MIN_AD_INTERVAL_MINUTES = 15;
const MAX_AD_INTERVAL_MINUTES = 24 * 60;

export function getAdCronSyncIntervalMinutes(): number {
  const raw = Number(
    process.env.AD_SYNC_INTERVAL_MINUTES ??
      DEFAULT_AD_CRON_SYNC_INTERVAL_MINUTES,
  );
  if (!Number.isFinite(raw) || raw < MIN_AD_INTERVAL_MINUTES) {
    return DEFAULT_AD_CRON_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(raw, MAX_AD_INTERVAL_MINUTES);
}

/** @deprecated preferir getAdCronSyncIntervalMinutes() */
export const AD_CRON_SYNC_INTERVAL_MINUTES = DEFAULT_AD_CRON_SYNC_INTERVAL_MINUTES;

/** Throttle interno do cron ads — alinhado ao intervalo configurado. */
export function getAdCronSyncIntervalMs(): number {
  return getAdCronSyncIntervalMinutes() * 60 * 1000;
}

/** @deprecated preferir getAdCronSyncIntervalMs() */
export const AD_CRON_SYNC_INTERVAL_MS =
  DEFAULT_AD_CRON_SYNC_INTERVAL_MINUTES * 60 * 1000;

/** @deprecated sync automático de 5 min removido — usar getAdCronSyncIntervalMs() */
export const AD_API_SYNC_INTERVAL_MS = AD_CRON_SYNC_INTERVAL_MS;

/** @deprecated usar getAdCronSyncIntervalMs() */
export const AD_INTRADAY_SYNC_INTERVAL_MS = AD_CRON_SYNC_INTERVAL_MS;

/** @deprecated sync ads só via cron em produção */
export const AD_BACKGROUND_SYNC_CHECK_MS = AD_CRON_SYNC_INTERVAL_MS;
