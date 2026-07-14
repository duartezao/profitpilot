/** Mínimo entre pedidos à Google/Meta/TikTok por conta (evita rate limit). */
export const AD_API_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** @deprecated usar AD_API_SYNC_INTERVAL_MS */
export const AD_INTRADAY_SYNC_INTERVAL_MS = AD_API_SYNC_INTERVAL_MS;

/** Leitura rápida da BD no cliente (sem chamar APIs externas). */
export const LIVE_DATA_POLL_MS = 30 * 1000;

/** Loop de background local (instrumentation) — alinhado ao throttle API. */
export const AD_BACKGROUND_SYNC_CHECK_MS = AD_API_SYNC_INTERVAL_MS;

/** Cron Vercel — 1×/dia (quota Google Ads em Explorer/Basic). */
export const AD_CRON_SYNC_INTERVAL_MINUTES = 24 * 60;
