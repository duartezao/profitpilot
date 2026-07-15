import { NextResponse } from "next/server";
import { buildCollectionSalesReport } from "@/lib/collection-sales";
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
    const storeId = params.get("store");
    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    const periodQs = periodQueryFromSearchParams(params);
    const periodParams = new URLSearchParams(periodQs);
    const format = exportFormatFromParams(params);
    const isExport = params.get("format") != null;

    const data = await buildCollectionSalesReport(
      user.workspaceId,
      storeId,
      {
        period: periodParams.get("period"),
        from: periodParams.get("from"),
        to: periodParams.get("to"),
        dates: periodParams.get("dates"),
      },
      isExport ? { collectionLimit: 200, productLimit: 500 } : undefined,
    );

    if (!isExport) {
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const headers = ["Coleção", "Handle", "Unidades", "Receita"];
    const rows = data.collections.map((c) => [
      c.collectionTitle,
      c.handle ?? "",
      c.units,
      c.revenueFmt,
    ]);

    const safeName = safeExportFilename(data.storeName || "loja");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `colecoes-vendas-${safeName}`,
      sheetName: "Coleções",
      pdfTitle: `Vendas por coleção · ${data.storeName}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
