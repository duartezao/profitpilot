/**
 * Agendador interno só para desenvolvimento local (`npm run dev`).
 * Em produção na Vercel o sync é feito por um único Vercel Cron a cada 4 h
 * (`/api/cron/sync` + `vercel.json`) — evita pedidos extra por instância.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL === "1") return;

  const g = globalThis as typeof globalThis & { __ppSyncStarted?: boolean };
  if (g.__ppSyncStarted) return;
  g.__ppSyncStarted = true;

  const { runDueSyncs } = await import("./lib/auto-sync");

  const checkMinutes = Math.max(1, Number(process.env.SYNC_CHECK_MINUTES ?? 15));
  const tick = () => {
    runDueSyncs().catch(() => {
      /* erros tratados por loja; não derrubar o agendador */
    });
  };

  setTimeout(tick, 20_000);
  setInterval(tick, checkMinutes * 60 * 1000);
}
