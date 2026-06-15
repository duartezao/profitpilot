import "server-only";
import { gzipSync, gunzipSync } from "zlib";

/** Tupla compacta por dia do mês: [dia 1–31, sessões, ATC, checkout, concluídas]. */
export type DayTuple = [number, number, number, number, number];

export type DaySessionCounts = {
  sessions: number;
  cart: number;
  checkout: number;
  completed: number;
};

export function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Gzip de array JSON — ~200–400 B por mês típico. */
export function encodeMonthBlob(days: Map<number, DaySessionCounts>): Buffer {
  const arr: DayTuple[] = [];
  for (const [dom, c] of days) {
    arr.push([dom, c.sessions, c.cart, c.checkout, c.completed]);
  }
  arr.sort((a, b) => a[0] - b[0]);
  return gzipSync(JSON.stringify(arr));
}

export function decodeMonthBlob(blob: Buffer): Map<number, DaySessionCounts> {
  const out = new Map<number, DaySessionCounts>();
  if (!blob?.length) return out;

  try {
    const raw = gunzipSync(blob).toString("utf8");
    const arr = JSON.parse(raw) as DayTuple[];
    if (!Array.isArray(arr)) return out;

    for (const row of arr) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const [dom, s, ca, ch, co] = row;
      if (dom < 1 || dom > 31) continue;
      out.set(dom, {
        sessions: s,
        cart: ca,
        checkout: ch,
        completed: co,
      });
    }
  } catch {
    return out;
  }
  return out;
}

export function dateKeyFromMonthDay(monthKey: string, dom: number): string {
  return `${monthKey}-${String(dom).padStart(2, "0")}`;
}
