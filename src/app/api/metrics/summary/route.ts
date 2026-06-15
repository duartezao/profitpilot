import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { buildWorkspaceSummary } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const storeId = params.get("store") ?? undefined;
  if (storeId && !canAccessStore(user.storeAccess, storeId)) {
    return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });
  }
  const summary = await buildWorkspaceSummary(user.workspaceId, storeId, {
    period: params.get("period"),
    from: params.get("from"),
    to: params.get("to"),
    dates: params.get("dates"),
  });

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
