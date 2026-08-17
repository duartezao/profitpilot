import "server-only";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  loadProfitSheetExportData,
  PROFIT_SHEET_DATA_ROW_OFFSET,
} from "@/lib/profit-sheet-data";
import type { CurrentUser } from "@/lib/auth";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "assets",
  "profit-sheet-template.xlsx",
);

/**
 * Fallback .xlsx local — não preserva funcionalidades Google Sheets
 * (ARRAYFORMULA, gráficos ligados, etc.). Preferir buildProfitSheetGoogleSpreadsheet.
 */
export async function buildProfitSheetXlsx(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
): Promise<{ buffer: Buffer; storeName: string } | null> {
  const data = await loadProfitSheetExportData(user, storeId);
  if (!data) return null;

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(
      "Template Profit Sheet em falta (assets/profit-sheet-template.xlsx).",
    );
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  for (const update of data.updates) {
    const sheet = wb.getWorksheet(update.sheet);
    if (!sheet) continue;
    sheet.getCell(`${update.col}${update.row}`).value = update.value;
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    storeName: data.storeName,
  };
}

export { loadProfitSheetExportData, PROFIT_SHEET_DATA_ROW_OFFSET };
