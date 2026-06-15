"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { addStoreAction, type AddStoreState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-sm font-medium";

const REQUIRED_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_inventory",
  "read_fulfillments",
  "read_returns",
  "read_shopify_payments_accounts",
  "read_shopify_payments_disputes",
  "read_reports",
];

function ScopesBox() {
  const [copied, setCopied] = useState(false);
  const value = REQUIRED_SCOPES.join(",");

  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Scopes (permissões) necessárias</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium hover:bg-muted"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-positive" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REQUIRED_SCOPES.map((s) => (
          <code
            key={s}
            className="rounded bg-surface px-1.5 py-0.5 text-xs text-foreground"
          >
            {s}
          </code>
        ))}
      </div>
    </div>
  );
}

export function AddStoreForm({
  workspaces = [],
  defaultWorkspaceId = "",
}: {
  workspaces?: { id: string; name: string }[];
  defaultWorkspaceId?: string;
}) {
  const [state, action, pending] = useActionState<AddStoreState, FormData>(
    addStoreAction,
    {},
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <form action={action} className="space-y-4">
        {state.error && (
          <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {state.error}
          </p>
        )}

        {workspaces.length > 0 && (
          <div>
            <label className={labelCls}>Workspace</label>
            <select
              name="workspaceId"
              defaultValue={defaultWorkspaceId}
              className={inputCls}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              A loja ficará visível apenas neste workspace.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Nome da loja</label>
          <input name="name" type="text" required className={inputCls} placeholder="North Store" data-sensitive />
        </div>

        <div>
          <label className={labelCls}>Domínio Shopify</label>
          <input
            name="shopDomain"
            type="text"
            required
            className={inputCls}
            placeholder="aminhaloja.myshopify.com"
            data-sensitive
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Domínio técnico .myshopify.com — só para ligar à API.
          </p>
        </div>

        <div>
          <label className={labelCls}>URL público da loja</label>
          <input
            name="displayUrl"
            type="text"
            required
            className={inputCls}
            placeholder="minhaloja.com"
            data-sensitive
          />
          <p className="mt-1 text-xs text-muted-foreground">
            O teu domínio .com — aparece na dashboard e nos reports diários.
          </p>
        </div>

        <div>
          <label className={labelCls}>ID de cliente (Client ID)</label>
          <input
            name="clientId"
            type="text"
            required
            autoComplete="off"
            className={inputCls}
            placeholder="64fe8f4a30c5b875e4af396c21cba81b"
          />
        </div>

        <div>
          <label className={labelCls}>Chave secreta (Client secret)</label>
          <input
            name="clientSecret"
            type="password"
            required
            autoComplete="off"
            className={inputCls}
            placeholder="shpss_…"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Geramos um token de acesso automaticamente (válido ~24h, renovado em
            cada sincronização). As credenciais ficam encriptadas.
          </p>
        </div>

        <div>
          <label className={labelCls}>
            Importar dados desde{" "}
            <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input name="importStartDate" type="date" className={inputCls} />
          <p className="mt-1 text-xs text-muted-foreground">
            Deixa vazio para importar o histórico disponível.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {pending ? "A ligar…" : "Ligar loja"}
        </button>
      </form>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">
            Como obter as credenciais (Dev Dashboard)
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            <li>No Shopify Dev Dashboard, cria uma app.</li>
            <li>Em Configuration, ativa o Admin API e seleciona os scopes ao lado.</li>
            <li>Instala a app na tua loja (mesma organização que a app).</li>
            <li>Em Settings → Credenciais, copia o ID de cliente e a Chave secreta.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Nota: este método (client credentials) só funciona em lojas tuas.
            Desde 2026 a Shopify deixou de mostrar tokens shpat_ permanentes.
          </p>
        </div>
        <ScopesBox />
      </aside>
    </div>
  );
}
