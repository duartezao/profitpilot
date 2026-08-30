import { formatCurrency } from "@/lib/utils";

export type IncomingDayLine = {
  date: string;
  dateLabel: string;
  amount: number;
  amountFmt: string;
  kind: "payout" | "pending" | "received" | "external_gateway";
  kindLabel: string;
  detailLabel?: string;
};

const RECEIVED_LIKE_KINDS = new Set<IncomingDayLine["kind"]>([
  "received",
  "external_gateway",
]);

function normalizeIncomingDayLine(line: IncomingDayLine): IncomingDayLine {
  if (!RECEIVED_LIKE_KINDS.has(line.kind)) return line;
  return {
    ...line,
    kind: "received",
    kindLabel: "Recebido",
  };
}

function mergeKey(line: IncomingDayLine): string {
  const normalized = normalizeIncomingDayLine(line);
  return `${normalized.date}:${normalized.kind}`;
}

/** Agrega linhas por dia + tipo (received + external_gateway → received). */
export function mergeIncomingDayLines(
  lines: IncomingDayLine[],
  currency: string,
): IncomingDayLine[] {
  const map = new Map<string, IncomingDayLine>();
  for (const line of lines) {
    const normalized = normalizeIncomingDayLine(line);
    const key = mergeKey(line);
    const existing = map.get(key);
    if (existing) {
      existing.amount += normalized.amount;
      existing.amountFmt = formatCurrency(existing.amount, currency);
    } else {
      map.set(key, { ...normalized });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    if (a.kind === "payout" && b.kind !== "payout") return -1;
    if (b.kind === "payout" && a.kind !== "payout") return 1;
    return a.kind.localeCompare(b.kind);
  });
}

export function incomingDayLineReactKey(line: IncomingDayLine): string {
  return mergeKey(line);
}
