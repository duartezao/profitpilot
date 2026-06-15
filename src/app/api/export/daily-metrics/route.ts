import { NextResponse } from "next/server";
import { listDailyMetricsForExport } from "@/lib/daily-metrics-export";
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
    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const data = await listDailyMetricsForExport(user, storeId);
    if (!data) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const headers = [
      "Data",
      "Receita",
      "Encomendas",
      "COGS",
      "Envio",
      "Taxas",
      "Refunds",
      "Chargebacks",
      "Ad Spend",
      "Despesas op.",
      "Lucro líquido",
      "Margem %",
      "ROAS",
      "POAS",
    ];
    const fmt = (n: number | null | undefined) =>
      n != null && Number.isFinite(n) ? n.toFixed(2) : "";
    const rows = data.rows.map((r) => [
      r.dateKey,
      fmt(r.revenue),
      String(r.orders),
      fmt(r.cogs),
      fmt(r.shippingCost),
      fmt(r.feesTotal),
      fmt(r.refunds),
      fmt(r.chargebacks),
      fmt(r.adSpend),
      fmt(r.operatingExpenses),
      fmt(r.netProfit),
      fmt(r.margin),
      fmt(r.roas),
      fmt(r.poas),
    ]);

    const safeName = safeExportFilename(data.storeName || "loja");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `snapshots-${safeName}`,
      sheetName: "Snapshots",
      pdfTitle: `Snapshots · ${data.storeName}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
