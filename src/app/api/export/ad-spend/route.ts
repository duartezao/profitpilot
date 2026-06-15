import { NextResponse } from "next/server";
import { listAdSpendForExport } from "@/lib/ad-spend";
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

    const data = await listAdSpendForExport(user, storeId);
    if (!data) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const headers = [
      "Data",
      "Meta",
      "Google",
      "TikTok",
      "Ads total",
      "Fees",
      "Total",
      "Fonte",
      "Nota",
    ];
    const fmt = (n: number | null) => (n != null ? n.toFixed(2) : "");
    const rows = data.rows.map((r) => [
      r.dateKey,
      fmt(r.meta),
      fmt(r.google),
      fmt(r.tiktok),
      fmt(r.adsTotal),
      fmt(r.fees),
      fmt(r.grandTotal),
      r.source ?? "",
      r.note,
    ]);

    const safeName = safeExportFilename(data.storeName || "loja");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `ad-spend-${safeName}`,
      sheetName: "Ad Spend",
      pdfTitle: `Ad Spend · ${data.storeName}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
