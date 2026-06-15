import PDFDocument from "pdfkit";

export type PdfTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

/** PDF simples com título e tabela (server-side). */
export async function buildPdfTable(doc: PdfTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c as Buffer));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    pdf.fontSize(16).text(doc.title, { align: "left" });
    pdf.moveDown(0.5);
    pdf.fontSize(9);

    const colCount = doc.headers.length;
    const pageWidth = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const colWidth = pageWidth / colCount;

    let y = pdf.y;
    doc.headers.forEach((h, i) => {
      pdf.text(h, pdf.page.margins.left + i * colWidth, y, {
        width: colWidth - 4,
        continued: false,
      });
    });
    y += 14;
    pdf
      .moveTo(pdf.page.margins.left, y)
      .lineTo(pdf.page.width - pdf.page.margins.right, y)
      .stroke();
    y += 6;

    for (const row of doc.rows) {
      if (y > pdf.page.height - 72) {
        pdf.addPage();
        y = pdf.page.margins.top;
      }
      row.forEach((cell, i) => {
        pdf.text(cell, pdf.page.margins.left + i * colWidth, y, {
          width: colWidth - 4,
          continued: false,
        });
      });
      y += 12;
    }

    pdf.end();
  });
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

/** PDF com texto monoespaçado (relatórios). */
export async function buildPdfText(
  title: string,
  body: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c as Buffer));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    pdf.fontSize(14).text(title, { align: "left" });
    pdf.moveDown(0.75);
    pdf.fontSize(9).text(body, {
      align: "left",
      lineGap: 2,
    });
    pdf.end();
  });
}
