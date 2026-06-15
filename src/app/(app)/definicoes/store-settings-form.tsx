"use client";

import { useActionState } from "react";
import {
  updateStoreSettingsAction,
  type SettingsState,
} from "./actions";
import { RemoveBankrollForm } from "./remove-bankroll-form";
import { listSessionCountryOptions } from "@/lib/shopify-countries";
import { Sensitive } from "@/components/privacy-mode";
import { DecimalInput } from "@/components/decimal-input";
import {
  COGS_MODES,
  COGS_MODE_LABELS,
  COGS_INPUT_CURRENCIES,
  type CogsMode,
} from "@/lib/cogs-modes";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

export type StoreValues = {
  id: string;
  name: string;
  shopDomain: string;
  displayUrl: string;
  currency: string;
  status: "active" | "paused" | "archived";
  autoSync: boolean;
  startingBalance: number;
  startingBalanceDate: string;
  analyticsSessionCountry: string;
  cogsMode: CogsMode;
  cogsInputCurrency: string;
};

function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat("pt-PT", { style: "currency", currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export function StoreSettingsForm({
  store,
  canEdit,
  globalSyncLabel,
}: {
  store: StoreValues;
  canEdit: boolean;
  globalSyncLabel: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateStoreSettingsAction,
    {},
  );
  const symbol = currencySymbol(store.currency);
  const countryOptions = listSessionCountryOptions();

  return (
    <div className="space-y-4">
    <form action={action} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
      <input type="hidden" name="storeId" value={store.id} />

      <div className="flex items-center justify-end gap-3">
        {state.ok && <span className="text-xs text-positive">Guardado</span>}
        {state.error && <span className="text-xs text-negative">{state.error}</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Nome</label>
          <input name="name" defaultValue={store.name} disabled={!canEdit} className={inputCls} data-sensitive />
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <select
            name="status"
            defaultValue={store.status}
            disabled={!canEdit}
            className={inputCls}
          >
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
            <option value="archived">Arquivada</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Arquivada: deixa de aparecer no seletor e nas métricas consolidadas.
            O histórico mantém-se — reativa para voltar a contar.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>URL público da loja</label>
          <input
            name="displayUrl"
            type="text"
            defaultValue={store.displayUrl}
            disabled={!canEdit}
            className={inputCls}
            data-sensitive
            placeholder="minhaloja.com"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Domínio .com — dashboard e reports. Ligação API:{" "}
            <Sensitive as="span">{store.shopDomain}</Sensitive>
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Custos (COGS)</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Define como preenches o COGS nesta loja. Podes alterar depois do setup
          inicial.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Modo de COGS</label>
            <select
              name="cogsMode"
              defaultValue={store.cogsMode}
              disabled={!canEdit}
              className={inputCls}
            >
              {COGS_MODES.map((m) => (
                <option key={m} value={m}>
                  {COGS_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Moeda de entrada</label>
            <select
              name="cogsInputCurrency"
              defaultValue={store.cogsInputCurrency}
              disabled={!canEdit}
              className={inputCls}
            >
              {COGS_INPUT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              USD converte para a moeda base do workspace na dashboard.
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">
          Tesouraria{" "}
          <span className="text-muted-foreground">(por loja)</span>
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          Saldo conhecido numa data — ponto de partida para o “tenho € ou não?”
          desta loja. Para reforços de caixa depois, usa{" "}
          <a href="#capital-negocio" className="font-medium text-accent hover:underline">
            Capital no negócio
          </a>
          .
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Saldo inicial ({symbol})</label>
            <DecimalInput
              name="startingBalance"
              defaultValue={store.startingBalance}
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
          <div>
            <label className={labelCls}>Data do saldo</label>
            <input
              name="startingBalanceDate"
              type="date"
              defaultValue={store.startingBalanceDate}
              disabled={!canEdit}
              className={inputCls}
            />
          </div>
        </div>
        {canEdit &&
          (store.startingBalance !== 0 || Boolean(store.startingBalanceDate)) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Para remover o saldo inicial, usa o bloco «Retirar banca» abaixo
              deste formulário.
            </p>
          )}
      </div>

      <div>
        <p className="text-sm font-medium">
          Sessões Shopify{" "}
          <span className="text-muted-foreground">(funil)</span>
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          País usado nas métricas de sessões, ATC %, checkout % e CVR na
          dashboard. Todos os países ISO — definido uma vez, aplica-se a todos
          os períodos.
        </p>
        <label className={labelCls}>País das sessões</label>
        <select
          name="analyticsSessionCountry"
          defaultValue={store.analyticsSessionCountry}
          disabled={!canEdit}
          className={inputCls}
          data-sensitive
        >
          <option value="">Todos os países</option>
          {countryOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            Sync automático global: a cada {globalSyncLabel}. Um único pedido
            na Vercel sincroniza todas as lojas ativas (podes forçar sync
            manual na página Lojas).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            name="autoSync"
            type="checkbox"
            defaultChecked={store.autoSync}
            disabled={!canEdit}
            className="h-4 w-4 rounded border-border"
          />
          Incluir esta loja no sync automático
        </label>
      </div>

      {canEdit && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "A guardar…" : "Guardar"}
        </button>
      )}
    </form>
    {canEdit &&
      (store.startingBalance !== 0 || Boolean(store.startingBalanceDate)) && (
        <RemoveBankrollForm storeId={store.id} />
      )}
    </div>
  );
}
