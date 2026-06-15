import { NextResponse } from "next/server";
import { buildAdSpendView } from "@/lib/ad-spend-view";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const storeId = new URL(request.url).searchParams.get("store") ?? undefined;
    if (storeId) await requireWorkspaceStore(user, storeId, { activeOnly: true });
    const view = await buildAdSpendView(storeId);
    if (!view) {
      return NextResponse.json(
        { error: "Sem acesso a esta loja." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { ...view, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return authErrorResponse(e);
  }
}
