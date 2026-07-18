/**
 * Agendador interno só para desenvolvimento / servidor Node long-running.
 * Produção (Vercel): Shopify e Ads — cron a cada **30 min**
 * (`/api/cron/sync` + `/api/cron/ads-sync`, desfasados).
 * Com a app aberta o cliente só lê a BD — sync API só cron ou botão manual.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL === "1") return;

  const g = globalThis as typeof globalThis & {
    __ppSyncStarted?: boolean;
  };
  if (g.__ppSyncStarted) return;
  g.__ppSyncStarted = true;

  const { runDueSyncs } = await import("./lib/auto-sync");

  const shopifyCheckMinutes = Math.max(
    1,
    Number(process.env.SYNC_CHECK_MINUTES ?? 10),
  );

  const shopifyTick = () => {
    runDueSyncs().catch(() => {
      /* erros tratados por loja; não derrubar o agendador */
    });
  };

  setTimeout(shopifyTick, 20_000);
  setInterval(shopifyTick, shopifyCheckMinutes * 60 * 1000);
}
