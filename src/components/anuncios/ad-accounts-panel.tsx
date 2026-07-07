"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdAccountRow } from "@/lib/ad-accounts";
import {
  addAdAccountAction,
  consumeMetaOAuthTokenAction,
  discoverAdAccountsAction,
  type AdAccountActionState,
  type AdAccountsDiscoverState,
} from "@/app/(app)/anuncios/ad-account-actions";
import { AD_PLATFORM_LABELS, type AdPlatform } from "@/lib/ad-spend-platforms";
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
  embedded = false,
}: {
  storeId: string;
  accounts: AdAccountRow[];
  canEdit: boolean;
  onChanged?: () => void;
  /** Sem lista de contas ligadas (mostrada no pai). */
  embedded?: boolean;
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
              ? `Meta: ${pending.loginEmail} — procura contas abaixo.`
              : "Token Meta recebido — procura contas abaixo.",
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
          ? `${list.length} conta${list.length === 1 ? "" : "s"} encontrada${list.length === 1 ? "" : "s"}.`
          : "Nenhuma conta com este token.",
      );
    });
  }

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem permissão para ligar contas.
      </p>
    );
  }

  return (
    <div className="space-y-4">
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
        <Link
          href={metaOAuthStart}
          className="inline-flex rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Login Meta (OAuth)
        </Link>
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
          placeholder={platform === "meta" ? "EAA… ou OAuth acima" : "Token TikTok"}
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
        {!discoverError && discovered.length === 0 && token.trim().length >= 10 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Conta partilhada não aparece? Confirma que o token é do utilizador que
            aceitou o convite no Business Manager e que tens permissão ads_read.
          </p>
        )}
      </div>

      {discovered.length > 0 && (
        <form action={addAction} className="space-y-3 rounded-lg border border-border p-4">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="platform" value={platform} />
          <input type="hidden" name="linkedLoginEmail" value={linkedLoginEmail} />
          <input type="hidden" name="accessToken" value={token} />

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Escolher conta
            </label>
            <select
              name="externalAccountId"
              required
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={inputCls}
            >
              <option value="">Seleciona…</option>
              {discovered.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.id}) · {a.currency}
                  {a.inactive ? " · inactiva" : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={adding || !selectedId}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {adding ? "A ligar…" : "Ligar conta"}
          </button>
        </form>
      )}

      {!embedded && accounts.filter((a) => a.platform !== "google").length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma conta Meta/TikTok ligada.
        </p>
      )}
    </div>
  );
}
