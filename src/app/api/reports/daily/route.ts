import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildDailyReportText } from "@/lib/daily-report";
import { canAccessStore } from "@/lib/store-access";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("store")?.trim();
  const dateParam = url.searchParams.get("date")?.trim();

  if (!storeId) {
    return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
  }
  if (!canAccessStore(user.storeAccess, storeId)) {
    return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });
  }

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
    return NextResponse.json({ error: "Relatório indisponível." }, { status: 404 });
  }

  return NextResponse.json({
    text: report.text,
    storeName: report.storeName,
    dateKey: report.dateKey,
    dateLabel: report.dateKey.split("-").reverse().join("/"),
  });
}
