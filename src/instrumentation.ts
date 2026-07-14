/**
 * Agendador interno só para desenvolvimento / servidor Node long-running.
 * Produção (Vercel): Shopify e Ads — cron de 2 em 2 h (`/api/cron/sync`, `/api/cron/ads-sync`).
 * Com a app aberta o cliente só lê a BD (30 s) — sync ads API só cron ou botão manual.
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
    Number(process.env.SYNC_CHECK_MINUTES ?? 15),
  );

  const shopifyTick = () => {
    runDueSyncs().catch(() => {
      /* erros tratados por loja; não derrubar o agendador */
    });
  };

  setTimeout(shopifyTick, 20_000);
  setInterval(shopifyTick, shopifyCheckMinutes * 60 * 1000);
}
