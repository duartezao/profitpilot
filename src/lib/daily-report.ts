import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { DailyNote } from "@/models/DailyNote";
import { fetchStoreDayFinancials } from "@/lib/metrics";
import { getStoreDisplayUrl } from "@/lib/store-display";
import { parseDateInput } from "@/lib/period";
import { assertStoreAccess } from "@/lib/store-scope";
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

  const dayEnd = new Date(day);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const notes = await DailyNote.find({
    workspaceId: opts.workspaceId,
    date: { $gte: day, $lt: dayEnd },
    $or: [{ storeId: store._id }, { storeId: null }],
  }).lean();

  const storeNote =
    notes.find((n) => n.storeId && String(n.storeId) === String(store._id)) ??
    notes.find((n) => !n.storeId) ??
    null;

  const displayUrl = getStoreDisplayUrl(store) ?? store.shopDomain ?? store.name;
  const dayLabel = day.toLocaleDateString("pt-PT");
  const currency = store.currency ?? "EUR";

  const profitLine =
    financials.missingCogs > 0
      ? `${fmtReportNumber(financials.profit)}   (COGS em falta em ${financials.missingCogs} ${financials.missingCogs === 1 ? "produto" : "produtos"} vendido${financials.missingCogs === 1 ? "" : "s"} neste dia)`
      : fmtReportNumber(financials.profit);

  const obs = storeNote?.text?.trim() || "—";
  const scaleNote = storeNote?.didScale ? "Sim" : "0";

  const lines = [
    `DIA: ${dayLabel}`,
    `LOJA: ${displayUrl}`,
    `REV: ${fmtReportNumber(financials.revenue)}`,
    `REFUNDS: ${fmtReportMoney(financials.refunds, currency)}`,
    `ADSPEND: ${fmtReportNumber(financials.adSpend)}`,
    `PROFIT: ${profitLine}`,
    `ATC %: ${fmtReportPct(financials.atcPct)}`,
    `REACHED CHECKOUT %: ${fmtReportPct(financials.checkoutPct)}`,
    `CVR %: ${fmtReportPct(financials.cvrPct)}`,
    `CPC: —`,
    `CTR: —`,
    `CPM: —`,
    `Produtos testados: —`,
    `Coleções testadas: —`,
    `Quais coleções já testadas: —`,
    `Qual a próxima coleção a testar: —`,
    `Coleção best-seller: —`,
    `OBS: ${obs}`,
    `Scale hoje: ${scaleNote}`,
    `Principais dificuldades: —`,
  ];

  return {
    text: lines.join("\n"),
    dateKey: opts.dateKey,
    storeName: store.name,
  };
}
