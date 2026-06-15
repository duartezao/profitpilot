import { NextResponse } from "next/server";
import { buildDailyReportText } from "@/lib/daily-report";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim();
    const dateParam = url.searchParams.get("date")?.trim();

    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const dateKey =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : formatDateInput(addDays(startOfDay(new Date()), -1));

    const report = await buildDailyReportText({
      workspaceId: user.workspaceId,
      storeId,
      dateKey,
      storeAccess: user.storeAccess,
    });

    if (!report) {
      return NextResponse.json(
        { error: "Relatório indisponível." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      text: report.text,
      storeName: report.storeName,
      dateKey: report.dateKey,
      dateLabel: report.dateKey.split("-").reverse().join("/"),
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
