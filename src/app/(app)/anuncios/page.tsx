import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { storeQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import {
  addDays,
  formatDateInput,
  parseDateInput,
  startOfDay,
} from "@/lib/period";
import { scopeQueryFromInput } from "@/lib/scope-query";
import {
  buildAdSpendCalendar,
  buildStoreAdSpendSummaries,
  countMissingDays,
  resolveAdSpendRange,
} from "@/lib/ad-spend";
import { AdSpendForm } from "./ad-spend-form";
import { AdSpendRow } from "./ad-spend-row";

export const metadata: Metadata = { title: "Anúncios" };
export const dynamic = "force-dynamic";

export default async function AnunciosPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  const { store: storeId } = await searchParams;
  await connectToDatabase();

  const stores = await Store.find(storeQueryForUser(user!))
    .select("name currency importStartDate createdAt")
    .sort({ name: 1 })
    .lean();

  const scoped =
    storeId && user && canAccessStore(user.storeAccess, storeId)
      ? stores.find((s) => String(s._id) === storeId)
      : null;

  const canEdit = ["owner", "admin", "editor"].includes(user?.role ?? "");
  const yesterday = formatDateInput(addDays(startOfDay(new Date()), -1));
  const workspace = await Workspace.findById(user?.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";

  if (!scoped) {
    const summaries =
      stores.length > 0
        ? await buildStoreAdSpendSummaries(stores, baseCurrency)
        : [];

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anúncios</h1>
          <p className="text-sm text-muted-foreground">
            Ad spend manual por loja — para quando não tens contas ligadas ou o
            sync falha. Seleciona uma loja na barra superior para preencher.
          </p>
        </div>

        {stores.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-muted-foreground">
            Liga uma loja para registar ad spend.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Dias em falta por loja</h2>
              <p className="text-sm text-muted-foreground">
                Desde a data de importação de cada loja até ontem. Preenche o dia
                anterior todos os dias se não importas automaticamente.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Loja</th>
                    <th className="px-4 py-3 text-right">Dias em falta</th>
                    <th className="px-4 py-3">Ontem</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => {
                    const qs = scopeQueryFromInput({ store: s.storeId });
                    return (
                      <tr key={s.storeId} className="border-t border-border">
                        <td className="px-4 py-3 font-medium" data-sensitive>{s.storeName}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.missingCount}
                        </td>
                        <td className="px-4 py-3">
                          {s.yesterdayMissing ? (
                            <span className="text-xs font-medium text-warning">
                              Em falta
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={qs ? `/anuncios?${qs}` : "/anuncios"}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Preencher
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Quando ligares Meta, Google ou TikTok, o gasto importado substitui ou
          complementa estes valores (por implementar).
        </p>
      </div>
    );
  }

  const range = resolveAdSpendRange(scoped.importStartDate, scoped.createdAt);
  const rangeLabel = `${parseDateInput(range.fromKey)?.toLocaleDateString("pt-PT") ?? range.fromKey} – ${parseDateInput(range.toKey)?.toLocaleDateString("pt-PT") ?? range.toKey}`;

  const calendar = await buildAdSpendCalendar(
    scoped._id,
    baseCurrency,
    scoped.importStartDate,
    scoped.createdAt,
  );
  const missingDays = calendar.filter((d) => d.amount === null);
  const missingCount = countMissingDays(calendar);
  const yesterdayMissing = missingDays.some((d) => d.isYesterday);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Anúncios · <span data-sensitive>{scoped.name}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Regista o gasto em ads por dia (USD, EUR ou GBP). Converte para{" "}
          {baseCurrency} com a taxa do dia. Ontem e dias anteriores ficam
          fechados — o sync automático só substitui o gasto de hoje.
        </p>
      </div>

      {missingCount > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {missingCount} {missingCount === 1 ? "dia em falta" : "dias em falta"}
                {yesterdayMissing ? " — incluindo ontem" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Preenche o ad spend de cada dia para o lucro real ficar correto.
                Com contas ligadas, só o dia de hoje é atualizado em cada sync;
                ontem já não muda porque o dia acabou.
              </p>
            </div>
          </div>
        </div>
      )}

      <AdSpendForm
        storeId={String(scoped._id)}
        storeName={scoped.name}
        baseCurrency={baseCurrency}
        defaultDate={yesterday}
        minDate={range.fromKey}
        canEdit={canEdit}
      />

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Dias a preencher</h2>
          <p className="text-sm text-muted-foreground">
            Desde a importação da loja ({rangeLabel}). Edita qualquer dia ou
            preenche os que faltam.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Dia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total ({baseCurrency})</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {calendar.map((row) => (
                <AdSpendRow
                  key={row.dateKey}
                  row={row}
                  storeId={String(scoped._id)}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
