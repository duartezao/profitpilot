/**
 * Agendador interno só para desenvolvimento / servidor Node long-running.
 * Em produção na Vercel o sync Shopify é feito por Vercel Cron (`/api/cron/sync`, de 2 em 2 h).
 * Ads: cron Vercel `/api/cron/ads-sync` 1×/dia às 01:00 UTC (quota Google).
 * Com a app aberta, o cliente lê a BD a cada 30 s e pede sync API a cada 5 min.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL === "1") return;

  const g = globalThis as typeof globalThis & {
    __ppSyncStarted?: boolean;
    __ppAdSyncStarted?: boolean;
  };
  if (g.__ppSyncStarted) return;
  g.__ppSyncStarted = true;

  const { runDueSyncs } = await import("./lib/auto-sync");
  const { runDueAdSyncs } = await import("./lib/ad-background-sync");

  const shopifyCheckMinutes = Math.max(
    1,
    Number(process.env.SYNC_CHECK_MINUTES ?? 15),
  );
  const adCheckMinutes = Math.max(
    1,
    Number(process.env.ADS_SYNC_CHECK_MINUTES ?? 5),
  );

  const shopifyTick = () => {
    runDueSyncs().catch(() => {
      /* erros tratados por loja; não derrubar o agendador */
    });
  };

  const adTick = () => {
    if (g.__ppAdSyncStarted) return;
    g.__ppAdSyncStarted = true;
    runDueAdSyncs()
      .catch(() => {
        /* não derrubar o agendador */
      })
      .finally(() => {
        g.__ppAdSyncStarted = false;
      });
  };

  setTimeout(shopifyTick, 20_000);
  setInterval(shopifyTick, shopifyCheckMinutes * 60 * 1000);

  setTimeout(adTick, 45_000);
  setInterval(adTick, adCheckMinutes * 60 * 1000);
}
