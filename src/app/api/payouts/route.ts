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
    const url = new URL(request.url);
    const storeId = url.searchParams.get("store") ?? undefined;
    if (storeId) await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const data = await buildPayoutsView(user, storeId, {
      period: url.searchParams.get("period"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      dates: url.searchParams.get("dates"),
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
