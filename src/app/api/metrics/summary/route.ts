import { NextResponse } from "next/server";
import { getCachedWorkspaceSummary } from "@/lib/metrics-summary-cache";
import { syncAdSpendIfDue } from "@/lib/ad-intraday-sync";
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
    if (storeId) {
      await requireWorkspaceStore(user, storeId, { activeOnly: true });
      await syncAdSpendIfDue(storeId, user.workspaceId);
    }

    const summary = await getCachedWorkspaceSummary(
      user.workspaceId,
      storeId,
      {
        period: params.get("period"),
        from: params.get("from"),
        to: params.get("to"),
        dates: params.get("dates"),
      },
      user.storeAccess,
    );

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
