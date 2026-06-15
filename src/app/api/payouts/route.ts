import { NextResponse } from "next/server";
import { buildPayoutsView } from "@/lib/payouts-data";
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

    const data = await buildPayoutsView(user, storeId);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
