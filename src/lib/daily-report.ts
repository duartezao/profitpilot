import "server-only";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { fetchStoreDayFinancials } from "@/lib/metrics";
import { fetchStoreDailyNoteForDay } from "@/lib/daily-notes";
import { getStoreDisplayUrl } from "@/lib/store-display";
import { parseDateInput } from "@/lib/period";
import { assertStoreAccess, NON_ARCHIVED_STORE_FILTER } from "@/lib/store-scope";
import type { StoreAccess } from "@/lib/store-access";

function fmtReportNumber(n: number): string {
  return n.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtReportPct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtReportMoney(n: number, currency: string): string {
  if (currency === "EUR") return `${fmtReportNumber(n)}€`;
  return `${fmtReportNumber(n)} ${currency}`;
}

function pushLine(lines: string[], line: string): void {
  lines.push(line);
}

function pushIf(lines: string[], condition: boolean, line: string): void {
  if (condition) lines.push(line);
}

function pushManualField(
  lines: string[],
  label: string,
  value: string | undefined | null,
): void {
  const t = (value ?? "").trim();
  if (t) lines.push(`${label}: ${t}`);
}

export type DailyReportResult = {
  text: string;
  dateKey: string;
  storeName: string;
};

/** Gera o texto do relatório diário (template app.md) para copiar/exportar. */
export async function buildDailyReportText(opts: {
  workspaceId: string;
  storeId: string;
  dateKey: string;
  storeAccess: StoreAccess;
}): Promise<DailyReportResult | null> {
  assertStoreAccess(opts.storeAccess, opts.storeId);
  await connectToDatabase();

  const store = await Store.findOne({
    _id: opts.storeId,
    workspaceId: opts.workspaceId,
    deletedAt: null,
    ...NON_ARCHIVED_STORE_FILTER,
  })
    .select("name currency displayUrl shopDomain")
    .lean();
  if (!store) return null;

  const day = parseDateInput(opts.dateKey);
  if (!day) return null;

  const financials = await fetchStoreDayFinancials(
    opts.workspaceId,
    opts.storeId,
    opts.dateKey,
  );
  if (!financials) return null;

  const storeNote = await fetchStoreDailyNoteForDay(
    opts.workspaceId,
    opts.storeId,
    opts.dateKey,
  );

  const displayUrl = getStoreDisplayUrl(store) ?? store.shopDomain ?? store.name;
  const dayLabel = day.toLocaleDateString("pt-PT");
  const currency = store.currency ?? "EUR";

  const profitLine =
    financials.missingCogs > 0
      ? `${fmtReportNumber(financials.profit)}   (COGS em falta neste dia)`
      : fmtReportNumber(financials.profit);

  function resolveObs(
    note: Awaited<ReturnType<typeof fetchStoreDailyNoteForDay>>,
  ): string | null {
    if (!note) return null;
    const rfObs = note.reportFields.obs?.trim();
    if (rfObs) return rfObs;
    const legacy = note.text?.trim();
    return legacy || null;
  }

  const rf = storeNote?.reportFields;
  const obs = resolveObs(storeNote);

  const lines: string[] = [];
  pushLine(lines, `DIA: ${dayLabel}`);
  pushLine(lines, `LOJA: ${displayUrl}`);

  pushIf(lines, financials.revenue > 0, `REV: ${fmtReportNumber(financials.revenue)}`);
  pushIf(
    lines,
    financials.refunds > 0,
    `REFUNDS: ${fmtReportMoney(financials.refunds, currency)}`,
  );
  pushIf(
    lines,
    financials.adSpend != null,
    financials.adSpend != null
      ? `ADSPEND: ${fmtReportNumber(financials.adSpend)}`
      : "",
  );
  pushIf(
    lines,
    financials.revenue > 0 ||
      financials.adSpend != null ||
      financials.profit !== 0 ||
      financials.missingCogs > 0,
    `PROFIT: ${profitLine}`,
  );

  pushIf(
    lines,
    financials.atcPct != null,
    `ATC %: ${fmtReportPct(financials.atcPct)}`,
  );
  pushIf(
    lines,
    financials.checkoutPct != null,
    `REACHED CHECKOUT %: ${fmtReportPct(financials.checkoutPct)}`,
  );
  pushIf(
    lines,
    financials.cvrPct != null,
    `CVR %: ${fmtReportPct(financials.cvrPct)}`,
  );

  pushManualField(lines, "Produtos testados", rf?.productsTested);
  pushManualField(lines, "Coleções testadas", rf?.collectionsTested);
  pushManualField(lines, "Quais coleções já testadas", rf?.collectionsTestedList);
  pushManualField(lines, "Qual a próxima coleção a testar", rf?.nextCollection);
  pushManualField(lines, "Coleção best-seller", rf?.bestSellerCollection);
  pushIf(lines, obs != null, `OBS: ${obs}`);
  pushIf(lines, storeNote?.didScale === true, "Scale hoje: Sim");
  pushManualField(lines, "Principais dificuldades", rf?.difficulties);

  return {
    text: lines.join("\n"),
    dateKey: opts.dateKey,
    storeName: store.name,
  };
}
