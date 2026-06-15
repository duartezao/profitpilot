import { NextResponse } from "next/server";
import { buildWorkspacePnl } from "@/lib/metrics";
import { periodQueryFromSearchParams } from "@/lib/period";
import {
  buildExportResponse,
  safeExportFilename,
} from "@/lib/export-response";
import { exportFormatFromParams } from "@/lib/pdf-export";
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
    const format = exportFormatFromParams(params);
    const storeId = params.get("store")?.trim();
    if (storeId) {
      await requireWorkspaceStore(user, storeId, { activeOnly: true });
    }

    const periodQs = periodQueryFromSearchParams(params);
    const periodParams = new URLSearchParams(periodQs);

    const pnl = await buildWorkspacePnl(
      user.workspaceId,
      {
        period: periodParams.get("period"),
        from: periodParams.get("from"),
        to: periodParams.get("to"),
        dates: periodParams.get("dates"),
      },
      storeId ?? undefined,
      user.storeAccess,
    );

    const headers = [
      "Loja",
      "Receita",
      "COGS",
      "Envio",
      "Taxas",
      "Ad Spend",
      "Apps/Fixos",
      "Reembolsos",
      "Lucro",
      "Margem %",
      "Encomendas",
    ];

    const fmt = (n: number) => n.toFixed(2);
    const rows = pnl.stores.map((s) => [
      s.name,
      fmt(s.revenue),
      fmt(s.cogs),
      fmt(s.shipping),
      fmt(s.fees),
      fmt(s.adSpend),
      fmt(s.operatingExpenses),
      fmt(s.refunds),
      fmt(s.netProfit),
      fmt(s.margin),
      s.orders,
    ]);

    if (!storeId && pnl.stores.length > 1) {
      const t = pnl.totals;
      rows.push([
        "TOTAL",
        fmt(t.revenue),
        fmt(t.cogs),
        fmt(t.shipping),
        fmt(t.fees),
        fmt(t.adSpend),
        fmt(t.operatingExpenses),
        fmt(t.refunds),
        fmt(t.netProfit),
        fmt(t.margin),
        t.orders,
      ]);
    }

    const label = storeId ? "loja" : "consolidado";
    const safePeriod = safeExportFilename(pnl.periodLabel);
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `pnl-${label}-${safePeriod}`,
      sheetName: "P&L",
      pdfTitle: `P&L · ${pnl.periodLabel}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
