import { parseDateInput, startOfDay } from "@/lib/period";

export type ProfitWindowStatus = "provisional" | "consolidated" | "mixed";

/** Dias desde hoje (0 = hoje) até à meia-noite local. */
export function daysAgoFromToday(dateKey: string): number | null {
  const day = parseDateInput(dateKey);
  if (!day) return null;
  const today = startOfDay(new Date());
  const ms = today.getTime() - startOfDay(day).getTime();
  return Math.round(ms / 86_400_000);
}

/** Dia com mais de `refundWindowDays` — lucro considerado consolidado. */
export function isDateKeyConsolidated(
  dateKey: string,
  refundWindowDays: number,
): boolean {
  const daysAgo = daysAgoFromToday(dateKey);
  if (daysAgo == null) return false;
  return daysAgo > refundWindowDays;
}

export function classifyProfitWindow(
  dateKeys: string[],
  refundWindowDays: number,
): ProfitWindowStatus {
  if (dateKeys.length === 0) return "provisional";
  let hasProvisional = false;
  let hasConsolidated = false;
  for (const key of dateKeys) {
    if (isDateKeyConsolidated(key, refundWindowDays)) {
      hasConsolidated = true;
    } else {
      hasProvisional = true;
    }
  }
  if (hasProvisional && hasConsolidated) return "mixed";
  if (hasConsolidated) return "consolidated";
  return "provisional";
}

export function profitWindowNote(
  status: ProfitWindowStatus,
  refundWindowDays: number,
): string {
  if (status === "consolidated") {
    return `Lucro consolidado — todos os dias têm mais de ${refundWindowDays} dias (janela de refunds fechada).`;
  }
  if (status === "mixed") {
    return `Período misto — dias recentes (≤ ${refundWindowDays} dias) são provisórios; podem surgir reembolsos atrasados.`;
  }
  return `Lucro provisório — período dentro da janela de ${refundWindowDays} dias; reembolsos ainda podem alterar o resultado.`;
}
