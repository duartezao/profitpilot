import { NextResponse } from "next/server";
import { listStoreOrdersForExport } from "@/lib/orders";
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
    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const periodQs = periodQueryFromSearchParams(params);
    const periodParams = new URLSearchParams(periodQs);

    const data = await listStoreOrdersForExport(user, storeId, {
      period: periodParams.get("period"),
      from: periodParams.get("from"),
      to: periodParams.get("to"),
      dates: periodParams.get("dates"),
    });

    const headers = [
      "Pedido",
      "Data",
      "Estado",
      "Receita",
      "COGS",
      "Envio",
      "Taxas",
      "Lucro",
      "Reembolsado",
    ];
    const fmt = (n: number) => n.toFixed(2);
    const rows = data.rows.map((o) => [
      o.name,
      o.orderDateIso,
      o.financialStatus,
      fmt(o.revenue),
      fmt(o.cogs),
      fmt(o.shipping),
      fmt(o.fees),
      fmt(o.profit),
      fmt(o.refunded),
    ]);

    const safeName = safeExportFilename(data.storeName || "loja");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `pedidos-${safeName}`,
      sheetName: "Pedidos",
      pdfTitle: `Pedidos · ${data.storeName}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
