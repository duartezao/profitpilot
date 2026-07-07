"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { AdAccountRow } from "@/lib/ad-accounts";
import {
  addAdAccountAction,
  consumeMetaOAuthTokenAction,
  discoverAdAccountsAction,
  syncAdAccountsNowAction,
  updateAdAccountFeesAction,
  type AdAccountActionState,
  type AdAccountsDiscoverState,
} from "@/app/(app)/anuncios/ad-account-actions";
import { DeleteAdAccountButton } from "@/components/anuncios/delete-ad-account-button";
import { AD_PLATFORM_LABELS, type AdPlatform } from "@/lib/ad-spend-platforms";
import { CollapsibleSection } from "@/components/collapsible-section";
import { hrefOAuthStart } from "@/lib/scope-query";

const API_PLATFORMS = ["meta", "tiktok"] as const satisfies readonly AdPlatform[];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

type DiscoveredAccount = {
  id: string;
  name: string;
  currency: string;
  inactive?: boolean;
};

function mapDiscovered(res: AdAccountsDiscoverState): DiscoveredAccount[] {
  if (res.platform === "meta" && res.meta) {
    return res.meta.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      inactive: a.accountStatus !== 1,
    }));
  }
  if (res.platform === "tiktok" && res.tiktok) {
    return res.tiktok.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
    }));
  }
  return [];
}

export function AdAccountsPanel({
  storeId,
  accounts,
  canEdit,
  onChanged,
}: {
  storeId: string;
  accounts: AdAccountRow[];
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const searchParams = useSearchParams();
  const apiAccounts = accounts.filter((a) => a.platform !== "google");
  const [addState, addAction, adding] = useActionState<
    AdAccountActionState,
    FormData
  >(addAdAccountAction, {});
  const [platform, setPlatform] = useState<AdPlatform>("meta");
  const [token, setToken] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredAccount[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [discovering, startDiscover] = useTransition();
  const [oauthMsg, setOauthMsg] = useState<string | null>(null);
  const [linkedLoginEmail, setLinkedLoginEmail] = useState("");

  const errorCount = apiAccounts.filter((a) => a.status === "error").length;
  const selected = discovered.find((a) => a.id === selectedId);

  const metaOAuthStart = hrefOAuthStart(
    "/api/oauth/meta/start",
    storeId,
    searchParams,
  );

  useEffect(() => {
    if (addState.ok) onChanged?.();
  }, [addState.ok, onChanged]);

  useEffect(() => {
    const err = searchParams.get("oauth_error");
    if (err && err !== "store_required") {
      setOauthMsg(`OAuth falhou: ${err}`);
      return;
    }
    if (searchParams.get("oauth") === "meta" && canEdit) {
      void consumeMetaOAuthTokenAction(storeId).then((pending) => {
        if (pending) {
          setPlatform("meta");
          setToken(pending.token);
          setLinkedLoginEmail(pending.loginEmail ?? "");
          setOauthMsg(
            pending.loginEmail
              ? `Meta ligada como ${pending.loginEmail} — clica em Procurar contas.`
              : "Token Meta recebido — clica em Procurar contas.",
          );
        }
      });
    }
  }, [searchParams, canEdit, storeId]);

  function runDiscover() {
    const activeToken = token.trim();
    if (activeToken.length < 10) return;
    setDiscoverError(null);
    setDiscovered([]);
    setSelectedId("");
    startDiscover(async () => {
      const res = await discoverAdAccountsAction(platform, activeToken);
      if (res.error) {
        setDiscoverError(res.error);
        setOauthMsg(null);
        return;
      }
      const list = mapDiscovered(res);
      setDiscovered(list);
      if (list.length === 1) setSelectedId(list[0].id);
      setOauthMsg(
        list.length
          ? `Escolhe a conta (${list.length} encontrada${list.length === 1 ? "" : "s"}).`
          : "Nenhuma conta encontrada com este token.",
      );
    });
  }

  return (
    <CollapsibleSection
      id="contas-ads"
      title="Meta e TikTok (API)"
      description="Sync automático opcional. Google está no bloco acima ou usa gasto manual."
      defaultOpen={apiAccounts.length === 0 || errorCount > 0}
      badge={
        apiAccounts.length > 0 ? (
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
              errorCount > 0
                ? "border-negative/40 bg-negative/10 text-negative"
                : "border-border text-muted-foreground"
            }`}
          >
            {apiAccounts.length} ligada{apiAccounts.length === 1 ? "" : "s"}
            {errorCount > 0 ? ` · ${errorCount} erro` : ""}
          </span>
        ) : undefined
      }
    >
      {canEdit && (
        <div className="space-y-4 border-b border-border pb-4">
          <div className="flex flex-wrap gap-2">
            {API_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPlatform(p);
                  setDiscovered([]);
                  setSelectedId("");
                  setDiscoverError(null);
                  setOauthMsg(null);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  platform === p
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {AD_PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          {platform === "meta" && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={metaOAuthStart}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Ligar com Meta (OAuth)
              </Link>
              <span className="text-xs text-muted-foreground">
                ou cola System User token
              </span>
            </div>
          )}

          {oauthMsg && (
            <p className="text-sm text-muted-foreground">{oauthMsg}</p>
          )}

          {addState.error && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {addState.error}
            </p>
          )}
          {addState.ok && (
            <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
              Conta ligada.
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {platform === "meta" ? "Access token" : "Token TikTok"}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              className={inputCls}
              placeholder={platform === "meta" ? "EAA…" : "Token TikTok"}
            />
            <button
              type="button"
              disabled={discovering || token.trim().length < 10}
              onClick={runDiscover}
              className="mt-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {discovering ? "A procurar…" : "Procurar contas"}
            </button>
            {discoverError && (
              <p className="mt-2 text-sm text-negative">{discoverError}</p>
            )}
          </div>

          {discovered.length > 0 && (
            <form action={addAction} className="space-y-3">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="platform" value={platform} />
              <input
                type="hidden"
                name="linkedLoginEmail"
                value={linkedLoginEmail}
              />
              <input type="hidden" name="accessToken" value={token} />

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Conta
                </label>
                <select
                  name="externalAccountId"
                  required
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Escolhe uma conta…</option>
                  {discovered.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id}) · {a.currency}
                      {a.inactive ? " · inactiva" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Nome na app (opcional)
                  </label>
                  <input
                    name="accountName"
                    defaultValue={selected?.name}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Alocação (%)
                  </label>
                  <input
                    name="allocation"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={100}
                    className={inputCls}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="replacePlatformAccount"
                  value="true"
                  defaultChecked
                  className="mt-1"
                />
                <span>
                  Substituir outra conta {AD_PLATFORM_LABELS[platform]} desta loja.
                </span>
              </label>

              <button
                type="submit"
                disabled={adding || !selectedId}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                {adding ? "A ligar…" : "Ligar conta"}
              </button>
            </form>
          )}
        </div>
      )}

      {apiAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conta Meta/TikTok API — o gasto pode ficar só manual.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {apiAccounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{a.platformLabel}</p>
                <p className="text-sm text-muted-foreground" data-sensitive>
                  {a.accountName || a.externalAccountId}
                </p>
                {a.linkedLoginEmail && (
                  <p className="text-xs text-muted-foreground" data-sensitive>
                    Login: {a.linkedLoginEmail}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.externalAccountId}
                  {a.lastSyncError && (
                    <span className="text-negative"> — {a.lastSyncError}</span>
                  )}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <SyncNowButton storeId={storeId} />
                  <DeleteAdAccountButton
                    accountId={a.id}
                    onDeleted={onChanged}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function SyncNowButton({ storeId }: { storeId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        title="Sincronizar agora"
        className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await syncAdAccountsNowAction(storeId);
            if (res.error) setError(res.error);
          });
        }}
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      </button>
      {error && (
        <span className="max-w-[140px] text-right text-[10px] text-negative">
          {error}
        </span>
      )}
    </div>
  );
}
