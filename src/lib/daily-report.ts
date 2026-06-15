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

function fmtReportField(value: string | undefined | null): string {
  const t = (value ?? "").trim();
  return t || "—";
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

function resolveObs(note: Awaited<ReturnType<typeof fetchStoreDailyNoteForDay>>): string {
  if (!note) return "—";
  const rfObs = note.reportFields.obs?.trim();
  if (rfObs) return rfObs;
  return fmtReportField(note.text);
}
  const scaleNote = storeNote?.didScale ? "Sim" : "0";
  const rf = storeNote?.reportFields;
  const obs = resolveObs(storeNote);

  const lines = [
    `DIA: ${dayLabel}`,
    `LOJA: ${displayUrl}`,
    `REV: ${fmtReportNumber(financials.revenue)}`,
    `REFUNDS: ${fmtReportMoney(financials.refunds, currency)}`,
    `ADSPEND: ${financials.adSpend != null ? fmtReportNumber(financials.adSpend) : "—"}`,
    `PROFIT: ${profitLine}`,
    `ATC %: ${fmtReportPct(financials.atcPct)}`,
    `REACHED CHECKOUT %: ${fmtReportPct(financials.checkoutPct)}`,
    `CVR %: ${fmtReportPct(financials.cvrPct)}`,
    `CPC: —`,
    `CTR: —`,
    `CPM: —`,
    `Produtos testados: ${fmtReportField(rf?.productsTested)}`,
    `Coleções testadas: ${fmtReportField(rf?.collectionsTested)}`,
    `Quais coleções já testadas: ${fmtReportField(rf?.collectionsTestedList)}`,
    `Qual a próxima coleção a testar: ${fmtReportField(rf?.nextCollection)}`,
    `Coleção best-seller: ${fmtReportField(rf?.bestSellerCollection)}`,
    `OBS: ${obs}`,
    `Scale hoje: ${scaleNote}`,
    `Principais dificuldades: ${fmtReportField(rf?.difficulties)}`,
  ];

  return {
    text: lines.join("\n"),
    dateKey: opts.dateKey,
    storeName: store.name,
  };
}
