"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import {
  setManualCostAction,
  clearManualCostAction,
  type CostState,
} from "./actions";

const inputCls =
  "w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

export type CostRowData = {
  storeId: string;
  storeName: string;
  variantId: string;
  title: string;
  shopifyCost: number;
  manualCost: number | null;
  manualFrom: string | null;
  currency: string;
  unitsSold: number;
  orderCount: number;
};

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

export function CostRow({ row }: { row: CostRowData }) {
  const [setState, doSet, setting] = useActionState<CostState, FormData>(
    setManualCostAction,
    {},
  );
  const [, doClear, clearing] = useActionState<CostState, FormData>(
    clearManualCostAction,
    {},
  );

  const isManual = row.manualCost != null;
  const effective = isManual ? (row.manualCost as number) : row.shopifyCost;
  const missing = !isManual && row.shopifyCost <= 0;
  const dateDefault = row.manualFrom?.slice(0, 10) ?? "";

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <Sensitive className="block font-medium">{row.title}</Sensitive>
        <Sensitive className="block text-xs text-muted-foreground">
          {row.storeName}
        </Sensitive>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        <Sensitive>{row.unitsSold}</Sensitive>
        <span className="block text-xs">
          {row.orderCount} {row.orderCount === 1 ? "encomenda" : "encomendas"}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {missing ? (
          <span className="text-warning">Sem custo</span>
        ) : (
          <Sensitive>{fmt(effective, row.currency)}</Sensitive>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs ${isManual ? "text-accent" : missing ? "text-warning" : "text-muted-foreground"}`}
        >
          {isManual ? "Manual" : missing ? "—" : "Shopify"}
        </span>
      </td>
      <td className="px-4 py-3">
        <form action={doSet} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="storeId" value={row.storeId} />
          <input type="hidden" name="variantId" value={row.variantId} />
          <input
            name="manualCost"
            type="number"
            step="0.01"
            min="0"
            placeholder="custo"
            defaultValue={row.manualCost ?? ""}
            className={inputCls}
            data-sensitive
          />
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={dateDefault}
            title="Deixar vazio aplica a todas as vendas em falta de custo"
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <span className="text-xs text-muted-foreground">desde (opcional)</span>
          <button
            type="submit"
            disabled={setting}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {setting ? "…" : "Guardar"}
          </button>
          {setState.ok && <Check className="h-4 w-4 text-positive" />}
          {setState.error && (
            <span className="text-xs text-negative">{setState.error}</span>
          )}
        </form>
        {isManual && (
          <form action={doClear} className="mt-1">
            <input type="hidden" name="storeId" value={row.storeId} />
            <input type="hidden" name="variantId" value={row.variantId} />
            <button
              type="submit"
              disabled={clearing}
              className="text-xs text-muted-foreground hover:text-negative disabled:opacity-60"
            >
              {clearing ? "…" : "Limpar custo manual"}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
