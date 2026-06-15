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

/** Normaliza BSON Binary / Uint8Array do MongoDB para Buffer Node. */
export function blobToBuffer(blob: unknown): Buffer {
  if (!blob) return Buffer.alloc(0);
  if (Buffer.isBuffer(blob)) return blob;
  if (blob instanceof Uint8Array) return Buffer.from(blob);
  if (typeof blob === "object" && blob !== null) {
    const o = blob as {
      _bsontype?: string;
      buffer?: Uint8Array | ArrayBuffer;
      value?: (encoding?: string) => Buffer;
    };
    if (o._bsontype === "Binary" && o.buffer) {
      return Buffer.from(o.buffer);
    }
    if (typeof o.value === "function") {
      try {
        return o.value();
      } catch {
        /* fall through */
      }
    }
    if (o.buffer) {
      return Buffer.from(o.buffer);
    }
  }
  return Buffer.from(blob as ArrayBuffer);
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

export function decodeMonthBlob(blob: unknown): Map<number, DaySessionCounts> {
  const out = new Map<number, DaySessionCounts>();
  const buf = blobToBuffer(blob);
  if (!buf.length) return out;

  try {
    const raw = gunzipSync(buf).toString("utf8");
    const arr = JSON.parse(raw) as DayTuple[];
    if (!Array.isArray(arr)) return out;

    for (const row of arr) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const [dom, s, ca, ch, co] = row;
      if (dom < 1 || dom > 31) continue;
      out.set(dom, {
        sessions: Number(s) || 0,
        cart: Number(ca) || 0,
        checkout: Number(ch) || 0,
        completed: Number(co) || 0,
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
