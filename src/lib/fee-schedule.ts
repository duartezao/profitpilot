/** Taxa de processamento (Shopify Payments / gateway). */
export type FeeConfig = {
  processingPercent: number;
  processingFixed: number;
  transactionFeePercent: number;
};

export type FeeScheduleEntry = FeeConfig & {
  /** Dia civil YYYY-MM-DD (fuso da loja) a partir do qual esta taxa vale. */
  effectiveFromKey: string;
};

export function normalizeFeeConfig(raw?: Partial<FeeConfig> | null): FeeConfig {
  return {
    processingPercent: num(raw?.processingPercent),
    processingFixed: num(raw?.processingFixed),
    transactionFeePercent: num(raw?.transactionFeePercent),
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Ordena entradas por data de vigência (ascendente). */
export function sortFeeSchedule(
  schedule: FeeScheduleEntry[],
): FeeScheduleEntry[] {
  return [...schedule].sort((a, b) =>
    a.effectiveFromKey.localeCompare(b.effectiveFromKey),
  );
}

/**
 * Garante pelo menos uma entrada (legado `feeConfig` → desde `floorKey`).
 */
export function ensureFeeSchedule(
  schedule: FeeScheduleEntry[] | undefined | null,
  fallback: Partial<FeeConfig> | null | undefined,
  floorKey: string,
): FeeScheduleEntry[] {
  const sorted = sortFeeSchedule(schedule ?? []);
  if (sorted.length > 0) return sorted;
  return [
    {
      effectiveFromKey: floorKey,
      ...normalizeFeeConfig(fallback),
    },
  ];
}

/** Taxa aplicável a encomendas do dia `dateKey` (YYYY-MM-DD). */
export function resolveFeeConfigForDateKey(
  schedule: FeeScheduleEntry[] | undefined | null,
  fallback: Partial<FeeConfig> | null | undefined,
  dateKey: string,
  floorKey: string,
): FeeConfig {
  const entries = ensureFeeSchedule(schedule, fallback, floorKey);
  let chosen = entries[0]!;
  for (const e of entries) {
    if (dateKey >= e.effectiveFromKey) chosen = e;
    else break;
  }
  return normalizeFeeConfig(chosen);
}

/** Entrada mais recente do calendário de taxas. */
export function latestFeeScheduleEntry(
  schedule: FeeScheduleEntry[] | undefined | null,
): FeeScheduleEntry | null {
  const sorted = sortFeeSchedule(schedule ?? []);
  return sorted.length > 0 ? sorted[sorted.length - 1]! : null;
}

/**
 * Encomendas anteriores à última alteração mantêm `fees` já gravados no sync.
 */
export function shouldPreserveStoredOrderFees(
  existingFees: number | null | undefined,
  orderDateKey: string,
  schedule: FeeScheduleEntry[] | undefined | null,
): boolean {
  if (existingFees == null || !Number.isFinite(existingFees)) return false;
  const sorted = sortFeeSchedule(schedule ?? []);
  if (sorted.length <= 1) return false;
  const latest = sorted[sorted.length - 1]!;
  return orderDateKey < latest.effectiveFromKey;
}

export function computeOrderFees(
  totalPrice: number,
  config: FeeConfig,
): number {
  const feePercent =
    (config.processingPercent + config.transactionFeePercent) / 100;
  const feeFixed = config.processingFixed;
  return totalPrice * feePercent + (totalPrice > 0 ? feeFixed : 0);
}

export function formatFeeConfigLabel(
  config: FeeConfig,
  currency: string,
): string {
  const parts: string[] = [];
  const pct = config.processingPercent + config.transactionFeePercent;
  if (pct > 0) parts.push(`${pct.toFixed(2).replace(".", ",")}%`);
  if (config.processingFixed > 0) {
    try {
      const fixed = new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency,
      }).format(config.processingFixed);
      parts.push(`${fixed}/enc.`);
    } catch {
      parts.push(`${config.processingFixed} ${currency}/enc.`);
    }
  }
  return parts.length > 0 ? parts.join(" + ") : "0%";
}

function formatDateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT");
}

export type FeeScheduleEntryView = {
  effectiveFromKey: string;
  effectiveFromLabel: string;
  label: string;
  isLatest: boolean;
};

export function buildFeeScheduleViews(
  schedule: FeeScheduleEntry[],
  currency: string,
): FeeScheduleEntryView[] {
  const sorted = sortFeeSchedule(schedule);
  const latestKey = sorted[sorted.length - 1]?.effectiveFromKey;
  return sorted.map((e) => ({
    effectiveFromKey: e.effectiveFromKey,
    effectiveFromLabel: formatDateKeyLabel(e.effectiveFromKey),
    label: formatFeeConfigLabel(normalizeFeeConfig(e), currency),
    isLatest: e.effectiveFromKey === latestKey,
  }));
}
