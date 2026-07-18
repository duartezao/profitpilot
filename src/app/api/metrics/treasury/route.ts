import { NextResponse } from "next/server";
import { getCachedWorkspaceTreasury } from "@/lib/treasury-cache";
import { parseFreshParam } from "@/lib/request-fresh";
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

    const treasury = await getCachedWorkspaceTreasury(
      user.workspaceId,
      storeId,
      user.storeAccess,
      { fresh: parseFreshParam(params) },
    );

    return NextResponse.json(treasury, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
