"use client";

import { useActionState, useMemo, useState } from "react";
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
  /** Códigos ISO seleccionados; vazio = todos os países. */
  analyticsSessionCountries: string[];
  /** True quando já há order noutro país de sessões — COGS day a partir dessa data. */
  forceDayCogs: boolean;
  cogsDayFromKey?: string | null;
  cogsMode: CogsMode;
  cogsInputCurrency: string;
  externalGatewayPayoutBusinessDays: number | null;
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
  baseCurrency,
  canEdit,
  globalSyncLabel,
}: {
  store: StoreValues;
  /** Moeda base do workspace — saldo inicial é sempre nesta moeda (ex. EUR). */
  baseCurrency: string;
  canEdit: boolean;
  globalSyncLabel: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateStoreSettingsAction,
    {},
  );
  const bankrollSymbol = currencySymbol(baseCurrency);
  const storeCurrency = store.currency.toUpperCase();
  const baseCur = baseCurrency.toUpperCase();
  const bankrollDiffersFromStore = storeCurrency !== baseCur;
  const countryOptions = listSessionCountryOptions();
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    store.analyticsSessionCountries,
  );
  const [cogsMode, setCogsMode] = useState<CogsMode>(store.cogsMode);
  const multiCountry = selectedCountries.length > 1;
  const forceDayCogs = store.forceDayCogs && multiCountry;
  const effectiveCogsMode = forceDayCogs ? "day" : cogsMode;

  const selectedLabels = useMemo(() => {
    const map = new Map(countryOptions.map((c) => [c.code, c.label]));
    return selectedCountries.map((code) => map.get(code) ?? code);
  }, [countryOptions, selectedCountries]);

  function toggleCountry(code: string) {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      return [...prev, code].sort((a, b) => a.localeCompare(b));
    });
  }

  return (
    <div className="space-y-4">
    <form action={action} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
      <input type="hidden" name="storeId" value={store.id} />
      {selectedCountries.map((code) => (
        <input
          key={code}
          type="hidden"
          name="analyticsSessionCountries"
          value={code}
        />
      ))}
      <input type="hidden" name="cogsMode" value={effectiveCogsMode} />

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
        <p className="text-sm font-medium">
          Sessões Shopify{" "}
          <span className="text-muted-foreground">(funil)</span>
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          Países usados nas métricas de sessões, ATC %, checkout % e CVR.
          Vazio = mundo inteiro. Com vários países, o report separa o funil por
          país.
        </p>
        <label className={labelCls}>Países das sessões</label>
        {selectedCountries.length === 0 ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Nenhum seleccionado — todos os países (mundo).
          </p>
        ) : (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedLabels.map((label, i) => (
              <span
                key={selectedCountries[i]}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-0.5 text-xs"
              >
                {label}
                {canEdit && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => toggleCountry(selectedCountries[i]!)}
                    aria-label={`Remover ${label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-2">
          {countryOptions.map((c) => {
            const checked = selectedCountries.includes(c.code);
            return (
              <label
                key={c.code}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canEdit}
                  onChange={() => toggleCountry(c.code)}
                  className="h-4 w-4 rounded border-border"
                />
                <span data-sensitive>{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.code}</span>
              </label>
            );
          })}
        </div>
        {multiCountry && !forceDayCogs && (
          <p className="mt-2 text-xs text-muted-foreground">
            Podes manter o COGS automático. Só quando houver uma encomenda no
            novo país é que, a partir desse dia, passa a manual por dia — os
            dias anteriores mantêm o automático já registado.
          </p>
        )}
        {forceDayCogs && (
          <p className="mt-2 text-xs text-muted-foreground">
            Já houve encomenda noutro país de sessões
            {store.cogsDayFromKey
              ? ` (desde ${store.cogsDayFromKey})`
              : ""}
            — a partir dessa data o COGS é manual por dia; o histórico
            automático anterior mantém-se.
          </p>
        )}
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
              value={effectiveCogsMode}
              disabled={!canEdit || forceDayCogs}
              onChange={(e) => setCogsMode(e.target.value as CogsMode)}
              className={inputCls}
            >
              {COGS_MODES.map((m) => (
                <option
                  key={m}
                  value={m}
                  disabled={forceDayCogs && m !== "day"}
                >
                  {COGS_MODE_LABELS[m]}
                </option>
              ))}
            </select>
            {forceDayCogs && (
              <p className="mt-1 text-xs text-muted-foreground">
                Fixado em «Por dia» — há vendas noutro país de sessões.
              </p>
            )}
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
          desta loja, na moeda base do workspace ({baseCur}). Para reforços de
          caixa depois, usa{" "}
          <a href="#capital-negocio" className="font-medium text-accent hover:underline">
            Capital no negócio
          </a>
          .
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Saldo inicial ({bankrollSymbol})</label>
            <DecimalInput
              name="startingBalance"
              defaultValue={store.startingBalance}
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
            {bankrollDiffersFromStore && (
              <p className="mt-1 text-xs text-muted-foreground">
                Em {baseCur}, não na moeda da loja ({storeCurrency}). Ex.: o que
                tinhas na conta de payout em euros.
              </p>
            )}
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
        <div className="mt-4">
          <label className={labelCls}>
            Payout gateway externo (dias úteis)
          </label>
          <input
            name="externalGatewayPayoutBusinessDays"
            type="number"
            min={0}
            max={60}
            step={1}
            defaultValue={
              store.externalGatewayPayoutBusinessDays != null
                ? store.externalGatewayPayoutBusinessDays
                : ""
            }
            disabled={!canEdit}
            className={inputCls}
            placeholder="Desactivado"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Para Multibanco, PayPal ou outro gateway fora da Shopify Payments:
            quantos dias úteis (seg–sex) após cada encomenda{" "}
            <strong className="font-medium">paga</strong> o dinheiro cai na
            conta. Usado na tesouraria e projeção de «a receber». Deixa vazio
            se usas só Shopify Payments.
          </p>
        </div>
        {canEdit &&
          (store.startingBalance !== 0 || Boolean(store.startingBalanceDate)) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Para remover o saldo inicial, usa o bloco «Retirar banca» abaixo
              deste formulário.
            </p>
          )}
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
