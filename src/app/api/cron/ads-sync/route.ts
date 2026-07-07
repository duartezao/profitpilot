import { NextResponse } from "next/server";
import { runDueAdSyncs } from "@/lib/ad-background-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sync automático de ads (todas as lojas activas com conta API).
 * Hoje + até 2 dias em falta por loja; throttle 5 min por conta.
 *
 * Protegido por CRON_SECRET (header `Authorization: Bearer <CRON_SECRET>`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado." },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  const provided = auth?.replace(/^Bearer\s+/i, "") ?? "";

  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const result = await runDueAdSyncs();
  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
