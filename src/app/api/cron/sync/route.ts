import { NextResponse } from "next/server";
import { runDueSyncs } from "@/lib/auto-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Endpoint único de sync automático (Vercel Cron ou agendador externo).
 * Um pedido sincroniza todas as lojas em falta — intervalo global (2 h).
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

  const result = await runDueSyncs();
  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
