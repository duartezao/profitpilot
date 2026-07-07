import { NextResponse } from "next/server";
import { loadStoreCampaignsLive } from "@/lib/ad-campaign-live";
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
    const view = await loadStoreCampaignsLive(storeId, { syncFirst });

    return NextResponse.json(view, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
