import { NextResponse } from "next/server";
import { listPayoutsForExport } from "@/lib/payouts-data";
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
    const storeId = params.get("store")?.trim() || undefined;
    if (storeId) {
      await requireWorkspaceStore(user, storeId, { activeOnly: true });
    }

    const data = await listPayoutsForExport(user, storeId);

    const headers = [
      "Loja",
      "Data",
      "Estado",
      "Bruto",
      "Taxas",
      "Líquido",
      "Moeda",
    ];
    const fmt = (n: number) => n.toFixed(2);
    const rows = data.rows.map((p) => [
      p.storeName,
      p.issuedAtIso,
      p.status,
      fmt(p.gross),
      fmt(p.fee),
      fmt(p.net),
      p.currency,
    ]);

    const safeName = safeExportFilename(data.scopeName || "todas");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `payouts-${safeName}`,
      sheetName: "Payouts",
      pdfTitle: `Payouts · ${data.scopeName || "Todas"}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
