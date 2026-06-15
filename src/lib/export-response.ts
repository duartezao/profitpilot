import { NextResponse } from "next/server";
import { buildCsv } from "@/lib/csv";
import { buildXlsx, xlsxResponseHeaders } from "@/lib/xlsx-export";
import {
  buildPdfTable,
  buildPdfText,
  pdfResponseHeaders,
  type ExportFormat,
} from "@/lib/pdf-export";

export type { ExportFormat };

export async function buildExportResponse(opts: {
  format: ExportFormat;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
  sheetName?: string;
  pdfTitle?: string;
}): Promise<NextResponse> {
  const {
    format,
    headers,
    rows,
    filename,
    sheetName = "Dados",
    pdfTitle,
  } = opts;

  if (format === "xlsx") {
    const buf = buildXlsx(headers, rows, sheetName);
    return new NextResponse(new Uint8Array(buf), {
      headers: xlsxResponseHeaders(`${filename}.xlsx`),
    });
  }

  if (format === "pdf") {
    const strRows = rows.map((r) => r.map(String));
    const buf = await buildPdfTable({
      title: pdfTitle ?? filename,
      headers,
      rows: strRows,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: pdfResponseHeaders(`${filename}.pdf`),
    });
  }

  const csv = buildCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}

export async function buildTextPdfResponse(opts: {
  title: string;
  body: string;
  filename: string;
}): Promise<NextResponse> {
  const buf = await buildPdfText(opts.title, opts.body);
  return new NextResponse(new Uint8Array(buf), {
    headers: pdfResponseHeaders(`${opts.filename}.pdf`),
  });
}

export function safeExportFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, "-").slice(0, 40);
}
