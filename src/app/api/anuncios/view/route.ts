import { NextResponse } from "next/server";
import { buildAdSpendView } from "@/lib/ad-spend-view";
import { parseFreshParam } from "@/lib/request-fresh";
import { withRevisionMemoryCache } from "@/lib/revision-memory-cache";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const storeId = params.get("store") ?? undefined;
    if (storeId) await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const fresh = parseFreshParam(params);
    const scoped = storeId ?? "all";
    const view = await withRevisionMemoryCache(
      {
        key: `ws:${user.workspaceId}:ad-spend-view:${scoped}`,
        workspaceId: user.workspaceId,
        fresh,
      },
      () => buildAdSpendView(storeId),
    );
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
