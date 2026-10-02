/** Leitura rápida da BD no cliente (sem chamar APIs externas). */
export const LIVE_DATA_POLL_MS = 60 * 1000;

/** Intervalo mínimo entre syncs automáticos de ads (cron Vercel). */
export const DEFAULT_AD_CRON_SYNC_INTERVAL_MINUTES = 30;

/** Google OAuth: menos pedidos automáticos (refresh_token). Manual ignora. */
export const DEFAULT_GOOGLE_AD_SYNC_INTERVAL_MINUTES = 30;

const MIN_AD_INTERVAL_MINUTES = 15;
const MAX_AD_INTERVAL_MINUTES = 24 * 60;

const MIN_GOOGLE_INTERVAL_MINUTES = 30;
const MAX_GOOGLE_INTERVAL_MINUTES = 24 * 60;

export function getGoogleAdSyncIntervalMinutes(): number {
  const raw = Number(
    process.env.GOOGLE_AD_SYNC_INTERVAL_MINUTES ??
      DEFAULT_GOOGLE_AD_SYNC_INTERVAL_MINUTES,
  );
  if (!Number.isFinite(raw) || raw < MIN_GOOGLE_INTERVAL_MINUTES) {
    return DEFAULT_GOOGLE_AD_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(raw, MAX_GOOGLE_INTERVAL_MINUTES);
}

export function getGoogleAdSyncIntervalMs(): number {
  return getGoogleAdSyncIntervalMinutes() * 60 * 1000;
}

/** Conta Google já sincronizada dentro do intervalo — saltar no cron automático. */
export function isGoogleAdAccountSyncDue(
  lastSyncAt: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastSyncAt) return true;
  const t = new Date(lastSyncAt).getTime();
  if (!Number.isFinite(t) || t <= 0) return true;
  return nowMs - t >= getGoogleAdSyncIntervalMs();
}

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
