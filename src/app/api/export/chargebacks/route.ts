import { NextResponse } from "next/server";
import { listStoreChargebacksForExport } from "@/lib/chargebacks";
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

    const data = await listStoreChargebacksForExport(user, storeId, {
      period: periodParams.get("period"),
      from: periodParams.get("from"),
      to: periodParams.get("to"),
      dates: periodParams.get("dates"),
    });

    if (!data) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const headers = [
      "Pedido",
      "Data",
      "Estado",
      "Tipo",
      "Motivo",
      "Valor",
      "Moeda",
      "Valor base",
    ];
    const fmt = (n: number) => n.toFixed(2);
    const rows = data.rows.map((r) => [
      r.orderName,
      r.initiatedAtIso,
      r.status,
      r.type,
      r.reason,
      fmt(r.amount),
      r.currency,
      fmt(r.amountBase),
    ]);

    const safeName = safeExportFilename(data.storeName || "loja");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `chargebacks-${safeName}`,
      sheetName: "Chargebacks",
      pdfTitle: `Chargebacks · ${data.storeName}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
