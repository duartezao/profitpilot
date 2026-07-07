"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  saveWorkspaceGoogleLoginAction,
  deleteWorkspaceGoogleLoginAction,
  type AdAccountActionState,
} from "@/app/(app)/anuncios/ad-account-actions";
import { Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function GoogleWorkspaceLoginsPanel({
  logins,
  canEdit,
}: {
  logins: { id: string; loginEmail: string }[];
  canEdit: boolean;
}) {
  const searchParams = useSearchParams();
  const oauthOk = searchParams.get("google_login") === "ok";
  const oauthErr = searchParams.get("oauth_error");

  const [saveState, saveAction, saving] = useActionState<
    AdAccountActionState,
    FormData
  >(saveWorkspaceGoogleLoginAction, {});

  const [apiStatus, setApiStatus] = useState<{
    apiReady?: boolean;
    developerTokenConfigured?: boolean;
    apiVersion?: string;
    apiProbe?: { ok: boolean; error?: string };
  } | null>(null);

  useEffect(() => {
    if (oauthOk || saveState.ok) {
      /* página recarrega lista no próximo navigation */
    }
  }, [oauthOk, saveState.ok]);

  useEffect(() => {
    const firstId = logins[0]?.id;
    const q = firstId ? `?probe=1&credentialId=${encodeURIComponent(firstId)}` : "";
    void fetch(`/api/oauth/google/config${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setApiStatus)
      .catch(() => setApiStatus(null));
  }, [logins]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Autoriza cada Gmail <strong>uma vez</strong> no workspace. Nas lojas só
        escolhes o Gmail + Customer ID — sem repetir login Google em cada loja.
      </p>

      {oauthOk && logins.length > 0 && (
        <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          Gmail guardado no workspace.
        </p>
      )}
      {oauthOk && logins.length === 0 && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          O login Google voltou mas o Gmail não foi guardado. Autoriza outra vez
          — aceita o acesso ao email quando o Google pedir.
        </p>
      )}
      {oauthErr && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          OAuth falhou: {oauthErr}
        </p>
      )}

      {apiStatus && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <p>
            API Google Ads:{" "}
            {apiStatus.apiReady ? (
              <span className="font-medium text-positive">configurada</span>
            ) : (
              <span className="font-medium text-warning">
                incompleta no servidor
              </span>
            )}
            {apiStatus.apiVersion ? ` · ${apiStatus.apiVersion}` : ""}
          </p>
          {!apiStatus.developerTokenConfigured && (
            <p className="mt-1">
              Falta <code className="text-foreground">GOOGLE_ADS_DEVELOPER_TOKEN</code>{" "}
              no ambiente onde a app corre (Vercel → Settings → Environment
              Variables → <strong>Redeploy</strong>).
            </p>
          )}
          {apiStatus.apiProbe && !apiStatus.apiProbe.ok && (
            <p className="mt-1 text-negative">{apiStatus.apiProbe.error}</p>
          )}
          {apiStatus.apiProbe?.ok && (
            <p className="mt-1 text-positive">
              Ligação à API Google Ads OK com o Gmail autorizado.
            </p>
          )}
        </div>
      )}

      {logins.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {logins.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="text-sm font-medium" data-sensitive>
                {l.loginEmail}
              </span>
              {canEdit && (
                <RemoveGoogleLoginButton credentialId={l.id} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum Gmail autorizado ainda.
        </p>
      )}

      {canEdit && (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <Link
            href="/api/oauth/google/start?returnTo=definicoes"
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Autorizar novo Gmail
          </Link>
          <form action={saveAction} className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Ou colar refresh token + email (avançado)
            </p>
            <input
              name="loginEmail"
              type="email"
              placeholder="gmail@exemplo.com"
              className={inputCls}
              required
            />
            <input
              name="refreshToken"
              type="password"
              placeholder="Refresh token"
              className={inputCls}
              required
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {saving ? "A guardar…" : "Guardar"}
            </button>
            {saveState.error && (
              <p className="text-xs text-negative">{saveState.error}</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

function RemoveGoogleLoginButton({ credentialId }: { credentialId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    AdAccountActionState,
    FormData
  >(deleteWorkspaceGoogleLoginAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "Remover este Gmail do workspace? As lojas já ligadas mantêm sync até desligares a conta em Anúncios.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="credentialId" value={credentialId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "…" : "Remover"}
      </button>
      {state.error && (
        <p className="mt-1 text-xs text-negative">{state.error}</p>
      )}
    </form>
  );
}
