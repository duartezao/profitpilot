import { NextResponse } from "next/server";
import { syncAdSpendIfDue } from "@/lib/ad-intraday-sync";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

/** Sync intradiário de ads (throttle 5 min) — actualiza gasto de hoje na dashboard. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const storeId = new URL(request.url).searchParams.get("store");
    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const result = await syncAdSpendIfDue(storeId, user.workspaceId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
