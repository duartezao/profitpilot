import "server-only";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import {
  fetchStoreDayFinancials,
  fetchStoreRangeFinancials,
} from "@/lib/metrics";
import { fetchStoreDailyNoteForDay } from "@/lib/daily-notes";
import {
  fetchStoreAdInsightsForDay,
  aggregateStoreAdInsightsForPeriod,
} from "@/lib/ad-insights";
import { getStoreDisplayUrl } from "@/lib/store-display";
import { parseDateInput, formatDateInput, addDays, startOfDay } from "@/lib/period";
import { buildCollectionReportBlock } from "@/lib/collection-operations";
import { buildProductReportBlock } from "@/lib/product-operations";
import { assertStoreAccess, activeStoreQueryForUser, NON_ARCHIVED_STORE_FILTER } from "@/lib/store-scope";
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
    financials.operatingExpenses > 0,
    `DESPESAS: ${fmtReportNumber(financials.operatingExpenses)}`,
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

  const adInsights = await fetchStoreAdInsightsForDay(opts.storeId, opts.dateKey);
  if (adInsights) {
    if (adInsights.cpc != null) {
      pushLine(lines, `CPC: ${fmtReportMoney(adInsights.cpc, currency)}`);
    }
    if (adInsights.ctr != null) {
      pushLine(lines, `CTR %: ${fmtReportPct(adInsights.ctr)}`);
    }
    if (adInsights.cpm != null) {
      pushLine(lines, `CPM: ${fmtReportMoney(adInsights.cpm, currency)}`);
    }
  }

  pushManualField(lines, "Produtos testados", rf?.productsTested);
  pushManualField(lines, "Coleções testadas", rf?.collectionsTested);
  pushManualField(lines, "Quais coleções já testadas", rf?.collectionsTestedList);
  pushManualField(lines, "Qual a próxima coleção a testar", rf?.nextCollection);
  pushManualField(lines, "Coleção best-seller", rf?.bestSellerCollection);

  const collectionBlock = await buildCollectionReportBlock(
    opts.workspaceId,
    opts.storeId,
    opts.dateKey,
  );
  if (collectionBlock.lines.length) {
    pushLine(lines, "");
    pushLine(lines, "--- Operação (coleções) ---");
    for (const line of collectionBlock.lines) {
      pushLine(lines, line);
    }
  } else if (!rf?.collectionsTested && !rf?.nextCollection) {
    if (collectionBlock.testingNow) {
      pushLine(lines, `COLEÇÃO A TESTAR: ${collectionBlock.testingNow}`);
    }
    if (collectionBlock.nextCollection) {
      pushLine(lines, `PRÓXIMA COLEÇÃO: ${collectionBlock.nextCollection}`);
    }
    if (collectionBlock.testedList) {
      pushLine(lines, `COLEÇÕES JÁ TESTADAS: ${collectionBlock.testedList}`);
    }
    if (collectionBlock.skippedList) {
      pushLine(lines, `NÃO VAI TESTAR: ${collectionBlock.skippedList}`);
    }
    if (collectionBlock.reminder) {
      pushLine(lines, `LEMBRETE: ${collectionBlock.reminder}`);
    }
  }

  const productBlock = await buildProductReportBlock(
    opts.workspaceId,
    opts.storeId,
  );
  if (productBlock.lines.length) {
    pushLine(lines, "");
    pushLine(lines, "--- Operação (produtos) ---");
    for (const line of productBlock.lines) {
      pushLine(lines, line);
    }
  } else if (!rf?.productsTested && productBlock.testingNow) {
    pushLine(lines, `PRODUTOS A TESTAR: ${productBlock.testingNow}`);
    if (productBlock.testedList) {
      pushLine(lines, `PRODUTOS JÁ TESTADOS: ${productBlock.testedList}`);
    }
  }
  pushIf(lines, obs != null, `OBS: ${obs}`);
  pushIf(lines, storeNote?.didScale === true, "Scale hoje: Sim");
  pushManualField(lines, "Principais dificuldades", rf?.difficulties);

  return {
    text: lines.join("\n"),
    dateKey: opts.dateKey,
    storeName: store.name,
  };
}

export type MultiDailyReportResult = {
  text: string;
  dateKey: string;
  storeCount: number;
  dateLabel: string;
};

/** Relatório diário em texto — um bloco por loja acessível, separados por linha em branco. */
export async function buildMultiStoreDailyReportText(opts: {
  workspaceId: string;
  dateKey: string;
  storeAccess: StoreAccess;
}): Promise<MultiDailyReportResult | null> {
  await connectToDatabase();

  const stores = await Store.find(
    activeStoreQueryForUser({
      workspaceId: opts.workspaceId,
      storeAccess: opts.storeAccess,
    }),
  )
    .select("_id")
    .sort({ name: 1 })
    .lean();

  if (!stores.length) return null;

  const day = parseDateInput(opts.dateKey);
  if (!day) return null;

  const blocks = (
    await Promise.all(
      stores.map((store) =>
        buildDailyReportText({
          workspaceId: opts.workspaceId,
          storeId: String(store._id),
          dateKey: opts.dateKey,
          storeAccess: opts.storeAccess,
        }),
      ),
    )
  )
    .map((report) => report?.text.trim())
    .filter((text): text is string => Boolean(text));

  if (!blocks.length) return null;

  return {
    text: blocks.join("\n\n"),
    dateKey: opts.dateKey,
    storeCount: blocks.length,
    dateLabel: day.toLocaleDateString("pt-PT"),
  };
}

/** Lista de chaves de dia (YYYY-MM-DD) dos N dias que terminam em endKey (inclusive). */
function weekDateKeys(endKey: string, days = 7): string[] {
  const end = parseDateInput(endKey) ?? startOfDay(new Date());
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(formatDateInput(addDays(end, -i)));
  }
  return keys;
}

export type WeeklyReportResult = {
  text: string;
  startKey: string;
  endKey: string;
  rangeLabel: string;
  storeName: string;
};

/** Gera o texto do resumo semanal (7 dias até endKey) de uma loja. */
export async function buildWeeklyReportText(opts: {
  workspaceId: string;
  storeId: string;
  endKey: string;
  storeAccess: StoreAccess;
}): Promise<WeeklyReportResult | null> {
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

  const keys = weekDateKeys(opts.endKey);
  const financials = await fetchStoreRangeFinancials(
    opts.workspaceId,
    opts.storeId,
    keys,
  );
  if (!financials) return null;

  const startDate = parseDateInput(financials.startKey);
  const endDate = parseDateInput(financials.endKey);
  const rangeLabel =
    startDate && endDate
      ? `${startDate.toLocaleDateString("pt-PT")} – ${endDate.toLocaleDateString("pt-PT")}`
      : "";
  const displayUrl = getStoreDisplayUrl(store) ?? store.shopDomain ?? store.name;
  const currency = store.currency ?? "EUR";

  const profitLine =
    financials.missingCogs > 0
      ? `${fmtReportNumber(financials.profit)}   (COGS em falta em ${financials.missingCogs} dia(s))`
      : fmtReportNumber(financials.profit);

  const lines: string[] = [];
  pushLine(lines, `SEMANA: ${rangeLabel}`);
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
    financials.operatingExpenses > 0,
    `DESPESAS: ${fmtReportNumber(financials.operatingExpenses)}`,
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

  const adInsights = await aggregateStoreAdInsightsForPeriod(opts.storeId, keys);
  if (adInsights) {
    if (adInsights.cpc != null) {
      pushLine(lines, `CPC: ${fmtReportMoney(adInsights.cpc, currency)}`);
    }
    if (adInsights.ctr != null) {
      pushLine(lines, `CTR %: ${fmtReportPct(adInsights.ctr)}`);
    }
    if (adInsights.cpm != null) {
      pushLine(lines, `CPM: ${fmtReportMoney(adInsights.cpm, currency)}`);
    }
  }

  return {
    text: lines.join("\n"),
    startKey: financials.startKey,
    endKey: financials.endKey,
    rangeLabel,
    storeName: store.name,
  };
}

export type MultiWeeklyReportResult = {
  text: string;
  startKey: string;
  endKey: string;
  rangeLabel: string;
  storeCount: number;
};

/** Resumo semanal — um bloco por loja acessível. */
export async function buildMultiStoreWeeklyReportText(opts: {
  workspaceId: string;
  endKey: string;
  storeAccess: StoreAccess;
}): Promise<MultiWeeklyReportResult | null> {
  await connectToDatabase();

  const stores = await Store.find(
    activeStoreQueryForUser({
      workspaceId: opts.workspaceId,
      storeAccess: opts.storeAccess,
    }),
  )
    .select("_id")
    .sort({ name: 1 })
    .lean();

  if (!stores.length) return null;

  const reports = await Promise.all(
    stores.map((store) =>
      buildWeeklyReportText({
        workspaceId: opts.workspaceId,
        storeId: String(store._id),
        endKey: opts.endKey,
        storeAccess: opts.storeAccess,
      }),
    ),
  );

  const blocks: string[] = [];
  let rangeLabel = "";
  let startKey = opts.endKey;
  let endKey = opts.endKey;
  for (const report of reports) {
    if (report?.text.trim()) {
      blocks.push(report.text.trim());
      rangeLabel = report.rangeLabel;
      startKey = report.startKey;
      endKey = report.endKey;
    }
  }

  if (!blocks.length) return null;

  return {
    text: blocks.join("\n\n"),
    startKey,
    endKey,
    rangeLabel,
    storeCount: blocks.length,
  };
}
