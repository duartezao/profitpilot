"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import type {
  VariantListItem,
  VariantPricingSnapshot,
} from "@/lib/variant-pricing-types";
import { berRoas } from "@/lib/profit";
import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";

type VariantsResponse = { variants: VariantListItem[] };
type SnapshotResponse = { snapshot: VariantPricingSnapshot };

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

function fmtMoney(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

function fmtBer(v: number | null) {
  if (v == null) return "—";
  return v.toFixed(2).replace(".", ",");
}

function simulateBer(
  salePrice: number,
  unitCost: number,
  shippingPerUnit: number,
  feesPerUnit: number,
) {
  const revenue = Math.max(0, salePrice);
  const cogs = Math.max(0, unitCost);
  const shipping = Math.max(0, shippingPerUnit);
  const fees = Math.max(0, feesPerUnit);
  const cm = revenue - cogs - shipping - fees;
  const ber = berRoas({ revenue, cogs, shipping, fees });
  const marginPct = revenue > 0 ? (cm / revenue) * 100 : 0;
  return { ber, contributionMargin: cm, marginPct };
}

function HistoryTable({
  title,
  rows,
  valueLabel,
  currency,
}: {
  title: string;
  rows: VariantPricingSnapshot["pricePeriods"];
  valueLabel: string;
  currency: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Unidades vendidas enquanto este {valueLabel.toLowerCase()} esteve
          activo.
        </p>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3">{valueLabel}</th>
              <th className="px-5 py-3">Período</th>
              <th className="px-5 py-3 text-right">Dias</th>
              <th className="px-5 py-3 text-right">Unidades</th>
              <th className="px-5 py-3 text-right">Encomendas</th>
              <th className="px-5 py-3 text-right">Un./dia</th>
              <th className="px-5 py-3 text-right">Receita</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-6 text-center text-muted-foreground"
                >
                  Sem histórico registado.
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const prev = rows[i + 1];
              const changed = prev && Math.abs(row.value - prev.value) > 0.001;
              const up = changed && row.value > prev.value;
              const down = changed && row.value < prev.value;
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-5 py-3 tabular-nums">
                    <div className="flex items-center gap-2">
                      <Sensitive>{fmtMoney(row.value, currency)}</Sensitive>
                      {changed &&
                        (up ? (
                          <TrendingUp className="h-3.5 w-3.5 text-positive" />
                        ) : down ? (
                          <TrendingDown className="h-3.5 w-3.5 text-negative" />
                        ) : null)}
                      <span className="text-xs text-muted-foreground">
                        {row.source}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {row.periodLabel}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.daysActive}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <Sensitive>{row.unitsSold}</Sensitive>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.orderCount}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.unitsPerDay != null ? row.unitsPerDay : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <Sensitive>{fmtMoney(row.revenue, currency)}</Sensitive>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem histórico.</p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-lg border border-border bg-background p-3 text-sm"
          >
            <p className="font-medium tabular-nums">
              <Sensitive>{fmtMoney(row.value, currency)}</Sensitive>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {row.source}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.periodLabel} · {row.daysActive} dias
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
              <div>
                <p className="text-xs text-muted-foreground">Unidades</p>
                <Sensitive>{row.unitsSold}</Sensitive>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Un./dia</p>
                {row.unitsPerDay ?? "—"}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receita</p>
                <Sensitive>{fmtMoney(row.revenue, currency)}</Sensitive>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrecosClient({
  storeId,
  initialVariantId,
}: {
  storeId: string;
  initialVariantId: string;
}) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(initialVariantId);
  const [search, setSearch] = useState("");
  const [simPrice, setSimPrice] = useState("");
  const [simCost, setSimCost] = useState("");

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["variant-pricing-list", storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/products/variant-pricing?store=${encodeURIComponent(storeId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Falha ao carregar variantes.");
      return res.json() as Promise<VariantsResponse>;
    },
  });

  const { data: snapData, isLoading: snapLoading, isError: snapError } = useQuery({
    queryKey: ["variant-pricing-snapshot", storeId, variantId],
    enabled: Boolean(variantId),
    queryFn: async () => {
      const res = await fetch(
        `/api/products/variant-pricing?store=${encodeURIComponent(storeId)}&variant=${encodeURIComponent(variantId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Falha ao carregar histórico.");
      return res.json() as Promise<SnapshotResponse>;
    },
  });

  const selectVariant = useCallback(
    (id: string) => {
      setVariantId(id);
      setSimPrice("");
      setSimCost("");
      router.replace(
        `/produtos/precos?store=${encodeURIComponent(storeId)}&variant=${encodeURIComponent(id)}`,
      );
    },
    [router, storeId],
  );

  const variants = listData?.variants ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter((v) => v.title.toLowerCase().includes(q));
  }, [variants, search]);

  useEffect(() => {
    if (listLoading || variants.length === 0) return;
    const exists =
      variantId && variants.some((v) => v.variantId === variantId);
    if (!exists) selectVariant(variants[0].variantId);
  }, [listLoading, variants, variantId, selectVariant]);

  const snap = snapData?.snapshot;
  const currency = snap?.currency ?? "EUR";

  const parsedSimPrice = Number(simPrice.replace(",", "."));
  const parsedSimCost = Number(simCost.replace(",", "."));
  const effectiveSimPrice =
    simPrice.trim() && Number.isFinite(parsedSimPrice)
      ? parsedSimPrice
      : (snap?.currentPrice ?? 0);
  const effectiveSimCost =
    simCost.trim() && Number.isFinite(parsedSimCost)
      ? parsedSimCost
      : (snap?.currentCost ?? 0);

  const simulation =
    snap &&
    simulateBer(
      effectiveSimPrice,
      effectiveSimCost,
      snap.avgShippingPerUnit,
      snap.avgFeesPerUnit,
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Preço & COGS
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Só variantes com vendas. Histórico de preço e COGS, unidades por
            período e simulador de BER.
          </p>
        </div>
        <Link
          href={`/produtos?store=${encodeURIComponent(storeId)}`}
          className="text-sm text-accent hover:underline"
        >
          Voltar a Produtos
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Variante
          </label>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={cn(inputCls, "pl-9")}
              placeholder="Pesquisar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto">
            {listLoading && (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            )}
            {!listLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum produto vendido nesta loja.
              </p>
            )}
            {filtered.map((v) => (
              <button
                key={v.variantId}
                type="button"
                onClick={() => selectVariant(v.variantId)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  variantId === v.variantId
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <Sensitive className="block truncate font-medium">
                  {v.title}
                </Sensitive>
                <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                  {fmtMoney(v.price, currency)} · {v.unitsSold} un.
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {!variantId && (
            <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
              Escolhe uma variante à esquerda.
            </p>
          )}

          {variantId && snapError && !snapLoading && (
            <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
              Produto sem vendas registadas.
            </p>
          )}

          {variantId && snapLoading && !snap && (
            <div className="h-48 animate-pulse rounded-lg border border-border bg-muted" />
          )}

          {snap && (
            <>
              <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                <Sensitive as="h2" className="text-lg font-semibold">
                  {snap.title}
                </Sensitive>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Preço actual
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      <Sensitive>
                        {fmtMoney(snap.currentPrice, currency)}
                      </Sensitive>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      COGS actual
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      <Sensitive>
                        {fmtMoney(snap.currentCost, currency)}
                      </Sensitive>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vendas (total)
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      <Sensitive>{snap.totalUnitsSold}</Sensitive>
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        un. · {snap.totalOrders} enc.
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      BER histórico (média)
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {fmtBer(snap.actualBer)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Médias por unidade (histórico): envio{" "}
                  {fmtMoney(snap.avgShippingPerUnit, currency)} · taxas{" "}
                  {fmtMoney(snap.avgFeesPerUnit, currency)}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Simulador de BER</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Preço de venda expectável vs COGS — usa envio e taxas médios
                  reais desta variante.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Preço simulado
                    </label>
                    <input
                      className={cn(inputCls, "tabular-nums")}
                      inputMode="decimal"
                      placeholder={snap.currentPrice.toFixed(2)}
                      value={simPrice}
                      onChange={(e) => setSimPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      COGS simulado
                    </label>
                    <input
                      className={cn(inputCls, "tabular-nums")}
                      inputMode="decimal"
                      placeholder={snap.currentCost.toFixed(2)}
                      value={simCost}
                      onChange={(e) => setSimCost(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      BER expectável
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-semibold tabular-nums",
                        simulation?.ber != null && simulation.ber <= 0
                          ? "text-negative"
                          : "",
                      )}
                    >
                      {fmtBer(simulation?.ber ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Margem contrib.
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-semibold tabular-nums",
                        (simulation?.contributionMargin ?? 0) >= 0
                          ? "text-positive"
                          : "text-negative",
                      )}
                    >
                      {simulation
                        ? fmtMoney(simulation.contributionMargin, currency)
                        : "—"}
                    </p>
                    {simulation && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {simulation.marginPct.toFixed(1).replace(".", ",")}%
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <HistoryTable
                title="Histórico de preço de venda"
                rows={snap.pricePeriods}
                valueLabel="Preço"
                currency={currency}
              />

              <HistoryTable
                title="Histórico de COGS"
                rows={snap.costPeriods}
                valueLabel="COGS"
                currency={currency}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
