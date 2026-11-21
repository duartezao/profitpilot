import { formatCurrency } from "@/lib/utils";
import {
  dateKeyInPeriod,
  type PeriodDateKeys,
} from "@/lib/period-date-keys";

export type PersonalExpenseRow = {
  id: string;
  userId: string;
  userName: string;
  dateKey: string;
  description: string;
  amount: number;
  amountFmt: string;
  amountBase: number;
  amountBaseFmt: string;
  currency: string;
};

export type PersonalExpensePersonSummary = {
  userId: string;
  userName: string;
  totalBase: number;
  totalFmt: string;
  /** % do lucro líquido da empresa no período (null se lucro ≤ 0). */
  pctOfProfit: number | null;
  pctOfProfitFmt: string;
  /** % do total pessoal dos sócios no período. */
  shareOfPersonal: number | null;
  shareOfPersonalFmt: string;
  /** Diferença vs média dos sócios (positivo = gasta mais). */
  vsAverage: number;
  vsAverageFmt: string;
  /** 0–100 para barra de comparação. */
  barPct: number;
  entryCount: number;
};

export type PersonalExpenseOverview = {
  totalBase: number;
  totalFmt: string;
  pctOfProfit: number | null;
  pctOfProfitFmt: string;
  byPerson: PersonalExpensePersonSummary[];
  periodLabel: string;
  companyProfit: number;
  companyProfitFmt: string;
  personCount: number;
  averagePerPerson: number;
  averagePerPersonFmt: string;
};

export type PersonalViewMode = "week" | "month";

function pctFmt(pct: number | null): string {
  if (pct == null) return "—";
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

function parseDateKeyUtc(dateKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function formatDateKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function addDaysUtc(dateKey: string, days: number): string {
  const d = parseDateKeyUtc(dateKey);
  if (!d) return dateKey;
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateKeyUtc(d);
}

/** Segunda → domingo (ISO) em torno de `anchorDateKey`. */
export function resolvePersonalWeekRange(anchorDateKey: string): PeriodDateKeys {
  const d = parseDateKeyUtc(anchorDateKey) ?? new Date();
  const dow = d.getUTCDay(); // 0=dom
  const toMon = dow === 0 ? -6 : 1 - dow;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() + toMon);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const startKey = formatDateKeyUtc(start);
  const endKey = formatDateKeyUtc(end);
  const label = `Semana ${startKey.slice(8)}–${endKey.slice(8)}/${endKey.slice(5, 7)}`;
  return { label, startKey, endKey };
}

/** Mês civil YYYY-MM. */
export function resolvePersonalMonthRange(monthKey: string): PeriodDateKeys {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) {
    const today = formatDateKeyUtc(new Date());
    return resolvePersonalMonthRange(today.slice(0, 7));
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const startKey = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(Date.UTC(y, mo, 0, 12)).getUTCDate();
  const endKey = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  const labelDate = new Date(Date.UTC(y, mo - 1, 1, 12));
  const label = labelDate.toLocaleDateString("pt-PT", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  return { label, startKey, endKey };
}

export function shiftPersonalWeek(anchorDateKey: string, weeks: number): string {
  return addDaysUtc(anchorDateKey, weeks * 7);
}

export function shiftPersonalMonth(monthKey: string, months: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) return monthKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Últimos N meses (inclui o actual), do mais recente ao mais antigo. */
export function listRecentMonthKeys(count = 24, today = new Date()): string[] {
  const out: string[] = [];
  const y = today.getUTCFullYear();
  const mo = today.getUTCMonth();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, mo - i, 1, 12));
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

export function sumProfitForRange(
  profitByDateKey: Record<string, number>,
  period: PeriodDateKeys,
): number {
  let total = 0;
  if (period.specificDates?.length) {
    for (const k of period.specificDates) {
      total += profitByDateKey[k] ?? 0;
    }
    return total;
  }
  const start = parseDateKeyUtc(period.startKey);
  const end = parseDateKeyUtc(period.endKey);
  if (!start || !end) return 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    total += profitByDateKey[formatDateKeyUtc(d)] ?? 0;
  }
  return total;
}

export function buildPersonalExpenseOverview(
  rows: PersonalExpenseRow[],
  periodFilter: PeriodDateKeys,
  companyProfit: number,
  baseCurrency: string,
  /** Incluir membros sem gastos (comparação completa). */
  memberDirectory?: Array<{ userId: string; userName: string }>,
): PersonalExpenseOverview {
  const inPeriod = rows.filter((r) => dateKeyInPeriod(r.dateKey, periodFilter));

  const byUser = new Map<
    string,
    { userName: string; totalBase: number; entryCount: number }
  >();

  if (memberDirectory?.length) {
    for (const m of memberDirectory) {
      byUser.set(m.userId, {
        userName: m.userName,
        totalBase: 0,
        entryCount: 0,
      });
    }
  }

  for (const r of inPeriod) {
    const cur = byUser.get(r.userId) ?? {
      userName: r.userName,
      totalBase: 0,
      entryCount: 0,
    };
    cur.userName = r.userName || cur.userName;
    cur.totalBase += r.amountBase;
    cur.entryCount += 1;
    byUser.set(r.userId, cur);
  }

  const money = (v: number) => formatCurrency(v, baseCurrency);
  const profitPositive = companyProfit > 0;
  const totalBase = [...byUser.values()].reduce((s, v) => s + v.totalBase, 0);
  const personCount = Math.max(byUser.size, 1);
  const averagePerPerson = totalBase / personCount;
  const maxTotal = Math.max(
    0,
    ...[...byUser.values()].map((v) => v.totalBase),
  );

  const byPerson: PersonalExpensePersonSummary[] = [...byUser.entries()]
    .map(([userId, v]) => {
      const pct = profitPositive ? (v.totalBase / companyProfit) * 100 : null;
      const share =
        totalBase > 0 ? (v.totalBase / totalBase) * 100 : null;
      const vsAverage = v.totalBase - averagePerPerson;
      return {
        userId,
        userName: v.userName,
        totalBase: v.totalBase,
        totalFmt: money(v.totalBase),
        pctOfProfit: pct,
        pctOfProfitFmt: pctFmt(pct),
        shareOfPersonal: share,
        shareOfPersonalFmt: pctFmt(share),
        vsAverage,
        vsAverageFmt:
          vsAverage === 0
            ? money(0)
            : `${vsAverage > 0 ? "+" : "−"}${money(Math.abs(vsAverage))}`,
        barPct: maxTotal > 0 ? (v.totalBase / maxTotal) * 100 : 0,
        entryCount: v.entryCount,
      };
    })
    .sort((a, b) => b.totalBase - a.totalBase);

  const pctOfProfit = profitPositive
    ? (totalBase / companyProfit) * 100
    : null;

  return {
    totalBase,
    totalFmt: money(totalBase),
    pctOfProfit,
    pctOfProfitFmt: pctFmt(pctOfProfit),
    byPerson,
    periodLabel: periodFilter.label,
    companyProfit,
    companyProfitFmt: money(companyProfit),
    personCount: byUser.size,
    averagePerPerson,
    averagePerPersonFmt: money(averagePerPerson),
  };
}
