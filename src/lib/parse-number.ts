import { z } from "zod";

/** Normaliza texto colado/escrito (PT: 1.234,56 · EN: 1,234.56) para formato com ponto decimal. */
export function normalizeDecimalInput(raw: string): string {
  let s = raw
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/[€$£¥]/g, "");

  if (!s) return "";

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }

  return s;
}

/** Converte string/número com vírgula decimal para número. */
export function parseLocaleNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = normalizeDecimalInput(String(v));
  if (!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseLocaleNumberOrZero(v: unknown): number {
  return parseLocaleNumber(v) ?? 0;
}

/** Zod: aceita vírgula como separador decimal (ex.: "1,5"). */
export function zLocaleNumber<T extends z.ZodType<number>>(
  schema: T = z.number() as unknown as T,
) {
  return z.preprocess((v) => {
    const n = parseLocaleNumber(v);
    return n == null ? NaN : n;
  }, schema);
}
