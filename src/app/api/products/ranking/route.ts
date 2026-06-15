import { NextResponse } from "next/server";
import { buildStoreProductRanking } from "@/lib/metrics";
import { periodQueryFromSearchParams } from "@/lib/period";
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
    const storeId = params.get("store");
    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const periodQs = periodQueryFromSearchParams(params);
    const periodParams = new URLSearchParams(periodQs);

    const data = await buildStoreProductRanking(
      user.workspaceId,
      storeId,
      {
        period: periodParams.get("period"),
        from: periodParams.get("from"),
        to: periodParams.get("to"),
        dates: periodParams.get("dates"),
      },
      20,
    );

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
