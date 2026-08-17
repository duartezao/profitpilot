import { NextResponse } from "next/server";
import { buildProfitSheetXlsx } from "@/lib/profit-sheet-export";
import {
  buildProfitSheetGoogleSpreadsheet,
  canExportProfitSheet,
  humanizeProfitSheetGoogleError,
  isProfitSheetTemplateConfigured,
  profitSheetGoogleSetupMessage,
} from "@/lib/profit-sheet-google";
import { safeExportFilename } from "@/lib/export-response";
import { xlsxResponseHeaders } from "@/lib/xlsx-export";
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
    const storeId = params.get("store")?.trim();
    const format = params.get("format")?.trim() ?? "sheets";

    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }
    await requireWorkspaceStore(user, storeId, { activeOnly: true });

    if (format === "xlsx") {
      const data = await buildProfitSheetXlsx(user, storeId);
      if (!data) {
        return NextResponse.json(
          { error: "Loja não encontrada ou sem dados para exportar." },
          { status: 404 },
        );
      }
      const safeName = safeExportFilename(data.storeName || "loja");
      return new NextResponse(new Uint8Array(data.buffer), {
        headers: {
          ...xlsxResponseHeaders(`profit-sheet-${safeName}.xlsx`),
          "X-Profit-Sheet-Warning":
            "Fallback Excel — abre no Google Sheets para recuperar fórmulas do template original.",
        },
      });
    }

    if (!isProfitSheetTemplateConfigured()) {
      return NextResponse.json(
        {
          error:
            "Template em falta. Configura PROFIT_SHEET_TEMPLATE_ID no servidor.",
        },
        { status: 503 },
      );
    }

    if (!(await canExportProfitSheet(user.workspaceId))) {
      return NextResponse.json(
        {
          error: profitSheetGoogleSetupMessage(),
          connectUrl: `/api/oauth/google-sheets/start?returnTo=${encodeURIComponent("/metricas")}&store=${encodeURIComponent(storeId)}`,
        },
        { status: 503 },
      );
    }

    const sheet = await buildProfitSheetGoogleSpreadsheet(user, storeId);
    if (!sheet) {
      return NextResponse.json(
        { error: "Loja não encontrada ou sem dados para exportar." },
        { status: 404 },
      );
    }

    return NextResponse.redirect(sheet.url);
  } catch (e) {
    const message = humanizeProfitSheetGoogleError(e);
    if (
      message.includes("Google Drive API") ||
      message.includes("Google Sheets API") ||
      message.includes("Sem permissão") ||
      message.includes("Google Sheets nativo") ||
      message.includes("Office file") ||
      message.includes("PERMISSION_DENIED")
    ) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return authErrorResponse(e);
  }
}
