import { NextResponse } from "next/server";
import { getCachedDecisionSummary } from "@/lib/decision-summary-cache";
import { parseAnalysisWindow } from "@/lib/decision-types";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const params = new URL(req.url).searchParams;
    const storeId = params.get("store") ?? undefined;
    if (storeId) await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const data = await getCachedDecisionSummary(
      user.workspaceId,
      storeId,
      {
        period: params.get("period"),
        from: params.get("from"),
        to: params.get("to"),
        dates: params.get("dates"),
      },
      user.storeAccess,
      parseAnalysisWindow(params.get("window")),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
