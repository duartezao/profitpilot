import { NextResponse } from "next/server";
import { getCachedStoreCampaignsView } from "@/lib/ad-campaigns-cache";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store");
    if (!storeId) {
      return NextResponse.json(
        { error: "Indica a loja (?store=)." },
        { status: 400 },
      );
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const syncFirst = searchParams.get("sync") === "1";
    const view = await getCachedStoreCampaignsView(storeId, {
      period: searchParams.get("period"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      dates: searchParams.get("dates"),
    }, { syncFirst });

    return NextResponse.json(view, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
