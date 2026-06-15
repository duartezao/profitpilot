import { NextResponse } from "next/server";
import { buildStoreProductRanking } from "@/lib/metrics";
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
    const limit = isExport ? 100 : 20;

    const data = await buildStoreProductRanking(
      user.workspaceId,
      storeId,
      {
        period: periodParams.get("period"),
        from: periodParams.get("from"),
        to: periodParams.get("to"),
        dates: periodParams.get("dates"),
      },
      limit,
    );

    if (!isExport) {
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const headers =
      data.mode === "units"
        ? ["Produto", "Unidades", "Receita"]
        : ["Produto", "Unidades", "Margem", "BER", "Lucro"];
    const rows =
      data.mode === "units"
        ? data.products.map((p) => [p.title, p.units, p.revenue])
        : data.products.map((p) => [
            p.title,
            p.units,
            p.margin,
            p.berRoas,
            p.profit,
          ]);

    const safeName = safeExportFilename(data.storeName || "loja");
    return buildExportResponse({
      format,
      headers,
      rows,
      filename: `produtos-${safeName}`,
      sheetName: "Produtos",
      pdfTitle: `Produtos · ${data.storeName}`,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
