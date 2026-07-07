"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Trash2, RefreshCw } from "lucide-react";
import type { AdAccountRow } from "@/lib/ad-accounts";
import {
  addAdAccountAction,
  consumeMetaOAuthTokenAction,
  consumeGoogleOAuthTokenAction,
  deleteAdAccountAction,
  discoverAdAccountsAction,
  syncAdAccountsNowAction,
  updateAdAccountFeesAction,
  type AdAccountActionState,
  type AdAccountsDiscoverState,
} from "@/app/(app)/anuncios/ad-account-actions";
import {
  AD_PLATFORM_LABELS,
  AD_PLATFORMS,
  type AdPlatform,
} from "@/lib/ad-spend-platforms";
import { CollapsibleSection } from "@/components/collapsible-section";
import { hrefOAuthStart, hrefWithScope } from "@/lib/scope-query";

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
  if (res.platform === "google" && res.google) {
    return res.google.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
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
}: {
  storeId: string;
  accounts: AdAccountRow[];
  canEdit: boolean;
}) {
  const searchParams = useSearchParams();
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
  const [googleOAuthLinked, setGoogleOAuthLinked] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);

  const errorCount = accounts.filter((a) => a.status === "error").length;
  const selected = discovered.find((a) => a.id === selectedId);

  const metaOAuthStart = hrefOAuthStart(
    "/api/oauth/meta/start",
    storeId,
    searchParams,
  );
  const googleOAuthStart = hrefOAuthStart(
    "/api/oauth/google/start",
    storeId,
    searchParams,
  );

  useEffect(() => {
    const err = searchParams.get("oauth_error");
    if (err) {
      if (err === "cancelled") {
        setOauthMsg("Ligação cancelada.");
      } else if (err === "store_required") {
        setOauthMsg("Selecciona uma loja antes de ligar uma conta de ads.");
      } else if (err === "store_access") {
        setOauthMsg("Sem acesso a esta loja.");
      } else if (
        err === "google_config" ||
        err === "google_config_client_id" ||
        err === "google_config_redirect"
      ) {
        setOauthMsg(
          err === "google_config_redirect"
            ? "OAuth Google: define NEXT_PUBLIC_APP_URL no servidor (ex. https://profitpilot-kappa.vercel.app) ou GOOGLE_ADS_OAUTH_REDIRECT_URI."
            : "OAuth Google não configurado no servidor. Adiciona GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET ao .env / Vercel.",
        );
      } else {
        setOauthMsg(`OAuth falhou: ${err}`);
      }
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
      return;
    }
    if (searchParams.get("oauth") === "google" && canEdit) {
      void consumeGoogleOAuthTokenAction(storeId).then((pending) => {
        if (pending) {
          setPlatform("google");
          setToken(pending.token);
          setLinkedLoginEmail(pending.loginEmail ?? "");
          setGoogleOAuthLinked(true);
          setShowManualToken(false);
          setOauthMsg(
            pending.loginEmail
              ? `Google ligado como ${pending.loginEmail} — a procurar contas…`
              : "Conta Google ligada — a procurar contas…",
          );
          void runDiscover({ token: pending.token, platform: "google" });
        }
      });
    }
  }, [searchParams, canEdit, storeId]);

  function runDiscover(opts?: { token?: string; platform?: AdPlatform }) {
    const activePlatform = opts?.platform ?? platform;
    const activeToken = (opts?.token ?? token).trim();
    if (activeToken.length < 10) return;
    setDiscoverError(null);
    setDiscovered([]);
    setSelectedId("");
    startDiscover(async () => {
      const res = await discoverAdAccountsAction(activePlatform, activeToken);
      if (res.error) {
        setDiscoverError(res.error);
        setOauthMsg(null);
        return;
      }
      const list = mapDiscovered(res);
      setDiscovered(list);
      if (list.length === 1) setSelectedId(list[0].id);
      if (linkedLoginEmail || googleOAuthLinked || activePlatform === "google") {
        setOauthMsg(
          list.length
            ? `Escolhe a conta de ads abaixo (${list.length} encontrada${list.length === 1 ? "" : "s"}).`
            : "Nenhuma conta Google Ads encontrada com este login.",
        );
      }
    });
  }

  const tokenLabel =
    platform === "google" ? "Refresh token (OAuth)" : "Access token";
  const tokenField = platform === "google" ? "refreshToken" : "accessToken";

  return (
    <CollapsibleSection
      id="contas-ads"
      title="Contas de ads (API)"
      description="Meta, Google e TikTok — cada loja com o seu login OAuth e sync automático."
      badge={
        accounts.length > 0 ? (
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
              errorCount > 0
                ? "border-negative/40 bg-negative/10 text-negative"
                : "border-border text-muted-foreground"
            }`}
          >
            {accounts.length} ligada{accounts.length === 1 ? "" : "s"}
            {errorCount > 0 ? ` · ${errorCount} erro` : ""}
          </span>
        ) : undefined
      }
    >
      {canEdit && (
        <CollapsibleSection
          title="Ligar conta"
          description="OAuth por loja — podes usar emails diferentes em cada loja."
        >
          <div className="flex flex-wrap gap-2">
            {AD_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPlatform(p);
                  setDiscovered([]);
                  setSelectedId("");
                  setDiscoverError(null);
                  if (p !== "google") {
                    setGoogleOAuthLinked(false);
                    setShowManualToken(false);
                  }
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
                ou cola um System User token · login independente por loja
              </span>
            </div>
          )}

          {platform === "google" && (
            <div className="space-y-3">
              {!googleOAuthLinked ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={googleOAuthStart}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                  >
                    Continuar com Google
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    Login Google — sem colar token
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {linkedLoginEmail
                    ? `Ligado como ${linkedLoginEmail}`
                    : "Conta Google autorizada"}
                  {discovering ? " · a procurar contas…" : ""}
                </p>
              )}
              {!googleOAuthLinked && (
                <button
                  type="button"
                  onClick={() => setShowManualToken((v) => !v)}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  {showManualToken
                    ? "Ocultar token manual"
                    : "Colar refresh token manualmente"}
                </button>
              )}
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
              Conta ligada e validada.
            </p>
          )}

          {(platform !== "google" || showManualToken) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {tokenLabel}
            </label>
            <input
              type="password"
              name={tokenField}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setGoogleOAuthLinked(false);
              }}
              autoComplete="off"
              className={inputCls}
              placeholder={platform === "google" ? "1//…" : "EAA… / token TikTok"}
            />
            <button
              type="button"
              disabled={discovering || token.trim().length < 10}
              onClick={() => runDiscover()}
              className="mt-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {discovering ? "A procurar…" : "Procurar contas"}
            </button>
            {discoverError && (
              <p className="mt-2 text-sm text-negative">{discoverError}</p>
            )}
          </div>
          )}

          {platform === "google" && googleOAuthLinked && discoverError && (
            <p className="text-sm text-negative">{discoverError}</p>
          )}

          {platform === "google" && googleOAuthLinked && !discoverError && !discovered.length && discovering && (
            <p className="text-sm text-muted-foreground">A procurar contas Google Ads…</p>
          )}

          {discovered.length > 0 && (
            <form action={addAction} className="space-y-3">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="platform" value={platform} />
              <input
                type="hidden"
                name="linkedLoginEmail"
                value={linkedLoginEmail}
              />
              {platform === "google" ? (
                <input type="hidden" name="refreshToken" value={token} />
              ) : (
                <input type="hidden" name="accessToken" value={token} />
              )}

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

              {selected && (
                <p className="text-xs text-muted-foreground">
                  Moeda: {selected.currency}
                </p>
              )}

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

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Fee fixa extra ({platform === "google" ? "USD" : "moeda da conta"})
                  </label>
                  <input
                    name="apiExtraFeeFixed"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={0}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Fee % agência (sobre o gasto)
                  </label>
                  <input
                    name="apiAgencyFeePercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    defaultValue={0}
                    className={inputCls}
                    placeholder="0"
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
                  Substituir outra conta {AD_PLATFORM_LABELS[platform]} desta loja
                  (o histórico de gasto já registado mantém-se).
                </span>
              </label>

              <button
                type="submit"
                disabled={adding || !selectedId}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                {adding ? "A ligar…" : "Ligar conta seleccionada"}
              </button>
            </form>
          )}
        </CollapsibleSection>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conta API — o ad spend fica só manual.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {accounts.map((a) => (
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
                  {a.allocation < 100 && ` · ${a.allocation}% alocação`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estado: {a.status}
                  {(a.apiExtraFeeFixed > 0 || a.apiAgencyFeePercent > 0) && (
                    <>
                      {" "}
                      · fee API:{" "}
                      {a.apiExtraFeeFixed > 0 ? `+${a.apiExtraFeeFixed} fixo` : ""}
                      {a.apiExtraFeeFixed > 0 && a.apiAgencyFeePercent > 0
                        ? " + "
                        : ""}
                      {a.apiAgencyFeePercent > 0
                        ? `${a.apiAgencyFeePercent}%`
                        : ""}
                    </>
                  )}
                  {a.lastSyncAt && (
                    <>
                      {" "}
                      · sync{" "}
                      {new Date(a.lastSyncAt).toLocaleString("pt-PT", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                  {a.lastSyncError && (
                    <span className="text-negative"> — {a.lastSyncError}</span>
                  )}
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-col items-end gap-2">
                  <AccountFeesForm account={a} />
                  <div className="flex items-center gap-2">
                    <SyncNowButton storeId={storeId} />
                    <DeleteAccountButton accountId={a.id} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function AccountFeesForm({ account }: { account: AdAccountRow }) {
  const [state, action, pending] = useActionState<AdAccountActionState, FormData>(
    updateAdAccountFeesAction,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-end justify-end gap-2">
      <input type="hidden" name="accountId" value={account.id} />
      <div>
        <label className="mb-0.5 block text-[10px] text-muted-foreground">
          Fee fixa
        </label>
        <input
          name="apiExtraFeeFixed"
          type="number"
          min={0}
          step="0.01"
          defaultValue={account.apiExtraFeeFixed}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-[10px] text-muted-foreground">
          Fee %
        </label>
        <input
          name="apiAgencyFeePercent"
          type="number"
          min={0}
          max={100}
          step="0.1"
          defaultValue={account.apiAgencyFeePercent}
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {pending ? "…" : "Fees"}
      </button>
      {state.ok && <span className="text-[10px] text-positive">OK</span>}
      {state.error && (
        <span className="max-w-[120px] text-[10px] text-negative">{state.error}</span>
      )}
    </form>
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

function DeleteAccountButton({ accountId }: { accountId: string }) {
  const [, action, pending] = useActionState<AdAccountActionState, FormData>(
    deleteAdAccountAction,
    {},
  );
  return (
    <form action={action}>
      <input type="hidden" name="accountId" value={accountId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-negative"
        title="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}
