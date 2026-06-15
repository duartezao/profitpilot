"use client";

import { useActionState } from "react";
import { updateStoreSettingsAction, type SettingsState } from "./actions";
import { listSessionCountryOptions } from "@/lib/shopify-countries";
import { Sensitive } from "@/components/privacy-mode";

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
  processingPercent: number;
  processingFixed: number;
  transactionFeePercent: number;
  startingBalance: number;
  startingBalanceDate: string;
  analyticsSessionCountry: string;
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
    <form action={action} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <input type="hidden" name="storeId" value={store.id} />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Sensitive as="p" className="truncate font-medium">
            {store.name}
          </Sensitive>
          <Sensitive as="p" className="truncate text-sm text-muted-foreground">
            {store.displayUrl || store.shopDomain}
          </Sensitive>
          {store.displayUrl && (
            <Sensitive as="p" className="truncate text-xs text-muted-foreground">
              API: {store.shopDomain}
            </Sensitive>
          )}
        </div>
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
        <p className="text-sm font-medium">
          Taxa de processamento{" "}
          <span className="text-muted-foreground">(por encomenda)</span>
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          Percentagem + valor fixo por encomenda. Ex.: Shopify Payments 1,5% +
          0,30 {symbol}. Usado para estimar o lucro real.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Percentagem (%)</label>
            <input
              name="processingPercent"
              type="number"
              step="0.01"
              placeholder="1.5"
              defaultValue={store.processingPercent}
              disabled={!canEdit}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Fixo por encomenda ({symbol})</label>
            <input
              name="processingFixed"
              type="number"
              step="0.01"
              placeholder="0.30"
              defaultValue={store.processingFixed}
              disabled={!canEdit}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Taxa extra (%){" "}
              <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              name="transactionFeePercent"
              type="number"
              step="0.01"
              placeholder="0"
              defaultValue={store.transactionFeePercent}
              disabled={!canEdit}
              className={inputCls}
            />
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
          desta loja.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Saldo inicial ({symbol})</label>
            <input
              name="startingBalance"
              type="number"
              step="0.01"
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
  );
}
