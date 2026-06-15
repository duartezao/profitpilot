import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { buildDecisionSummary } from "@/lib/decision";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const storeId = params.get("store") ?? undefined;
  if (storeId && !canAccessStore(user.storeAccess, storeId)) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  const data = await buildDecisionSummary(user.workspaceId, storeId, {
    period: params.get("period"),
    from: params.get("from"),
    to: params.get("to"),
    dates: params.get("dates"),
  });
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
