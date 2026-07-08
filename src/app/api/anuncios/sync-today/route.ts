import { NextResponse } from "next/server";
import { syncAdSpendIfDue } from "@/lib/ad-intraday-sync";
import { syncMissingAdMetricsForStore } from "@/lib/ad-metrics-backfill";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";
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

    // Manual refresh: força sync de hoje + backfill incremental (dias em lacuna)
    // e permite reescrever dias passados de origem API (ex.: ontem ainda incompleto).
    const intraday = await syncAdSpendIfDue(storeId, user.workspaceId, {
      force: true,
    });
    const backfill = await syncMissingAdMetricsForStore(storeId, {
      maxDays: 45,
      force: true,
    });
    if (intraday.synced || backfill.spendDays > 0 || backfill.synced > 0) {
      invalidateWorkspaceMetricsCache(user.workspaceId);
    }

    return NextResponse.json(
      {
        ...intraday,
        backfill,
      },
      {
      headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return authErrorResponse(e);
  }
}
