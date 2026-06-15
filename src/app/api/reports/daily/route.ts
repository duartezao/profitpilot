import { NextResponse } from "next/server";
import {
  buildDailyReportText,
  buildMultiStoreDailyReportText,
} from "@/lib/daily-report";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";
import {
  buildTextPdfResponse,
  safeExportFilename,
} from "@/lib/export-response";
import {
  authErrorResponse,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

function resolveDateKey(dateParam: string | null | undefined): string {
  return dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : formatDateInput(addDays(startOfDay(new Date()), -1));
}

function dailyReportFormatFromParams(
  params: URLSearchParams,
): "txt" | "pdf" | null {
  const f = params.get("format")?.toLowerCase();
  if (f === "txt") return "txt";
  if (f === "pdf") return "pdf";
  return null;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim();
    const allStores = url.searchParams.get("all") === "1";
    const format = dailyReportFormatFromParams(url.searchParams);
    const dateKey = resolveDateKey(url.searchParams.get("date")?.trim());

    if (allStores) {
      const report = await buildMultiStoreDailyReportText({
        workspaceId: user.workspaceId,
        dateKey,
        storeAccess: user.storeAccess,
      });

      if (!report) {
        return NextResponse.json(
          { error: "Relatório indisponível." },
          { status: 404 },
        );
      }

      if (format === "txt") {
        return new NextResponse(report.text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="relatorio-${report.dateKey}.txt"`,
          },
        });
      }

      if (format === "pdf") {
        return buildTextPdfResponse({
          title: `Relatório diário · ${report.dateLabel}`,
          body: report.text,
          filename: `relatorio-${report.dateKey}`,
        });
      }

      return NextResponse.json({
        text: report.text,
        storeName: `${report.storeCount} lojas`,
        dateKey: report.dateKey,
        dateLabel: report.dateLabel,
        storeCount: report.storeCount,
        multiStore: true,
      });
    }

    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

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

    const safeName = safeExportFilename(report.storeName || "loja");
    const dateLabel = report.dateKey.split("-").reverse().join("/");

    if (format === "txt") {
      return new NextResponse(report.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="relatorio-${safeName}-${report.dateKey}.txt"`,
        },
      });
    }

    if (format === "pdf") {
      return buildTextPdfResponse({
        title: `Relatório diário · ${report.storeName}`,
        body: report.text,
        filename: `relatorio-${safeName}-${report.dateKey}`,
      });
    }

    return NextResponse.json({
      text: report.text,
      storeName: report.storeName,
      dateKey: report.dateKey,
      dateLabel,
      multiStore: false,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
