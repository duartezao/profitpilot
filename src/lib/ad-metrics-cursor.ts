import { addDays, formatDateInput, parseDateInput } from "@/lib/period";

export type AdMetricsCursor = {
  /** Último dia com gasto guardado (qualquer origem). */
  lastSpendDateKey: string | null;
  /** Último dia com campanhas sincronizadas (contas activas). */
  lastCampaignDateKey: string | null;
  /** Último dia com gasto e campanhas completos. */
  lastCompleteDateKey: string | null;
};

export type ResolveIncrementalAdDateKeysInput = {
  allKeys: string[];
  today: string;
  maxDays: number;
  spendDays: Set<string>;
  campaignDays: Set<string>;
};

/**
 * Dias a sincronizar — incremental como Shopify (taxas/encomendas):
 * - **Hoje**: sempre (substitui totais frescos da API; não soma em cima).
 * - **Passado**: só lacunas (falta gasto ou campanhas); dias completos não voltam à API.
 * - Janela limitada a `maxDays` (os mais recentes).
 */
export function resolveIncrementalAdDateKeys(
  input: ResolveIncrementalAdDateKeysInput,
): string[] {
  const { allKeys, today, maxDays, spendDays, campaignDays } = input;
  const need = new Set<string>();

  for (const dateKey of allKeys) {
    if (dateKey > today) continue;

    const hasSpend = spendDays.has(dateKey);
    const hasCampaign = campaignDays.has(dateKey);

    if (dateKey === today) {
      need.add(dateKey);
      continue;
    }

    if (!hasSpend || !hasCampaign) {
      need.add(dateKey);
    }
  }

  return [...need].sort().slice(-Math.max(1, maxDays));
}

export function buildAdMetricsCursor(
  spendDateKeys: string[],
  campaignDateKeys: string[],
): AdMetricsCursor {
  const spendSorted = [...spendDateKeys].sort();
  const campaignSorted = [...campaignDateKeys].sort();
  const lastSpendDateKey = spendSorted.at(-1) ?? null;
  const lastCampaignDateKey = campaignSorted.at(-1) ?? null;

  const campaignSet = new Set(campaignDateKeys);
  const complete = spendSorted.filter((k) => campaignSet.has(k));
  const lastCompleteDateKey = complete.at(-1) ?? null;

  return {
    lastSpendDateKey,
    lastCampaignDateKey,
    lastCompleteDateKey,
  };
}

/** Dia seguinte a uma chave YYYY-MM-DD (para logs / janela incremental). */
export function dayAfterDateKey(dateKey: string): string | null {
  const d = parseDateInput(dateKey);
  if (!d) return null;
  return formatDateInput(addDays(d, 1));
}

import { CAMPAIGN_TEST_PHASE_DAYS } from "@/lib/campaign-decision";

/**
 * Google atribui conversões com atraso — re-sincronizar campanhas dos últimos N dias
 * (só conversões/ROAS; o gasto fechado não volta à API).
 * Alinhado com a 1.ª janela de kill (7 dias): refresca antes da decisão de matar.
 */
export const GOOGLE_CONVERSION_REFRESH_DAYS = CAMPAIGN_TEST_PHASE_DAYS;

export function googleConversionRefreshDateKeys(
  allKeys: string[],
  today: string,
  days = GOOGLE_CONVERSION_REFRESH_DAYS,
): string[] {
  const eligible = allKeys.filter((k) => k <= today).sort();
  return eligible.slice(-Math.max(1, days));
}

/** Gasto API só precisa de sync se for hoje ou dia passado ainda sem registo. */
export function needsAdSpendSyncForDay(
  dateKey: string,
  today: string,
  hasSpend: boolean,
): boolean {
  if (dateKey === today) return true;
  return !hasSpend;
}
