import { NextResponse } from "next/server";
import { buildWorkspaceTreasury } from "@/lib/treasury";
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

    const treasury = await buildWorkspaceTreasury(
      user.workspaceId,
      storeId,
      user.storeAccess,
    );

    return NextResponse.json(treasury, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
