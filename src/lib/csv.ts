/** Escapa um valor para CSV (RFC 4180). */
export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
