import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/** Inter Regular — CDN estável, sem ficheiros locais no servidor. */
const INTER_TTF_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.5/files/inter-latin-400-normal.ttf";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

let cachedInterBytes: Uint8Array | null = null;

export type PdfTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

async function loadInterBytes(): Promise<Uint8Array> {
  if (cachedInterBytes) return cachedInterBytes;
  const res = await fetch(INTER_TTF_URL, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Fonte Inter indisponível (${res.status}).`);
  }
  cachedInterBytes = new Uint8Array(await res.arrayBuffer());
  return cachedInterBytes;
}

async function embedAppFont(pdf: PDFDocument): Promise<PDFFont> {
  try {
    pdf.registerFontkit(fontkit);
    const bytes = await loadInterBytes();
    return pdf.embedFont(bytes);
  } catch {
    return pdf.embedFont(StandardFonts.Helvetica);
  }
}

function contentWidth(): number {
  return PAGE_WIDTH - MARGIN * 2;
}

function drawWrappedLine(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let currentY = y;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color: rgb(0, 0, 0) });
      currentY -= lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color: rgb(0, 0, 0) });
    currentY -= lineHeight;
  }

  return currentY;
}

/** PDF simples com título e tabela (server-side). */
export async function buildPdfTable(doc: PdfTable): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await embedAppFont(pdf);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(doc.title, {
    x: MARGIN,
    y: y - 16,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 32;

  const colCount = Math.max(doc.headers.length, 1);
  const colWidth = contentWidth() / colCount;
  const fontSize = 9;
  const rowHeight = 14;

  doc.headers.forEach((header, i) => {
    page.drawText(header.slice(0, 48), {
      x: MARGIN + i * colWidth,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });
  y -= rowHeight;

  page.drawLine({
    start: { x: MARGIN, y: y + 4 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 4 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 6;

  for (const row of doc.rows) {
    if (y < MARGIN + rowHeight) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    row.forEach((cell, i) => {
      page.drawText(String(cell).slice(0, 72), {
        x: MARGIN + i * colWidth,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    });
    y -= rowHeight;
  }

  return Buffer.from(await pdf.save());
}

export function pdfResponseHeaders(filename: string) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}

export function exportFormatFromParams(
  params: URLSearchParams,
): "csv" | "xlsx" | "pdf" {
  const f = params.get("format")?.toLowerCase();
  if (f === "xlsx" || f === "excel") return "xlsx";
  if (f === "pdf") return "pdf";
  return "csv";
}

export type ExportFormat = ReturnType<typeof exportFormatFromParams>;

/** PDF com texto (relatórios diários). */
export async function buildPdfText(
  title: string,
  body: string,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await embedAppFont(pdf);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(title, {
    x: MARGIN,
    y: y - 14,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 36;

  const fontSize = 9;
  const lineHeight = 12;
  const maxWidth = contentWidth();

  for (const line of body.split("\n")) {
    if (y < MARGIN + lineHeight) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    if (!line.trim()) {
      y -= lineHeight;
      continue;
    }

    if (font.widthOfTextAtSize(line, fontSize) <= maxWidth) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;
    } else {
      y = drawWrappedLine(
        page,
        font,
        line,
        MARGIN,
        y,
        fontSize,
        maxWidth,
        lineHeight,
      );
    }
  }

  return Buffer.from(await pdf.save());
}
