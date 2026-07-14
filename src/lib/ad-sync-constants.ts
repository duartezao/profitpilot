/** Leitura rápida da BD no cliente (sem chamar APIs externas). */
export const LIVE_DATA_POLL_MS = 30 * 1000;

/** Intervalo mínimo entre syncs automáticos de ads (cron Vercel). */
export const AD_CRON_SYNC_INTERVAL_MINUTES = 24 * 60;

/** Throttle interno do cron — alinhado ao intervalo do cron ads. */
export const AD_CRON_SYNC_INTERVAL_MS =
  AD_CRON_SYNC_INTERVAL_MINUTES * 60 * 1000;

/** @deprecated sync automático de 5 min removido — usar AD_CRON_SYNC_INTERVAL_MS */
export const AD_API_SYNC_INTERVAL_MS = AD_CRON_SYNC_INTERVAL_MS;

/** @deprecated usar AD_CRON_SYNC_INTERVAL_MS */
export const AD_INTRADAY_SYNC_INTERVAL_MS = AD_CRON_SYNC_INTERVAL_MS;

/** @deprecated sync ads só via cron em produção */
export const AD_BACKGROUND_SYNC_CHECK_MS = AD_CRON_SYNC_INTERVAL_MS;
