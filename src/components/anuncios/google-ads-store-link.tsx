"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  addAdAccountAction,
  discoverGoogleCredentialAction,
  type AdAccountActionState,
} from "@/app/(app)/anuncios/ad-account-actions";
import { DeleteAdAccountButton } from "@/components/anuncios/delete-ad-account-button";
import type { AdAccountRow } from "@/lib/ad-accounts";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

type WorkspaceGoogleLogin = { id: string; loginEmail: string };

type DiscoveredAccount = {
  id: string;
  name: string;
  currency: string;
  loginCustomerId?: string;
};

export function GoogleAdsStoreLink({
  storeId,
  canEdit,
  workspaceGoogleLogins,
  googleAdsApiReady,
  googleAccount,
  onChanged,
  embedded = false,
}: {
  storeId: string;
  canEdit: boolean;
  workspaceGoogleLogins: WorkspaceGoogleLogin[];
  googleAdsApiReady: boolean;
  googleAccount?: AdAccountRow;
  onChanged?: () => void;
  embedded?: boolean;
}) {
  const [credentialId, setCredentialId] = useState(
    workspaceGoogleLogins[0]?.id ?? "",
  );
  const [discovered, setDiscovered] = useState<DiscoveredAccount[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [discoverError, setDiscoverError] = useState("");
  const [manualMode, setManualMode] = useState(!googleAdsApiReady);
  const [discovering, startDiscover] = useTransition();

  const [state, action, pending] = useActionState<AdAccountActionState, FormData>(
    addAdAccountAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onChanged?.();
  }, [state.ok, onChanged]);

  useEffect(() => {
    const first = workspaceGoogleLogins[0]?.id ?? "";
    setCredentialId(first);
    setDiscovered([]);
    setSelectedId("");
    setDiscoverError("");
    setManualMode(!googleAdsApiReady);
  }, [workspaceGoogleLogins, googleAdsApiReady]);

  if (!canEdit) return null;

  if (googleAccount) {
    if (embedded) {
      return (
        <p className="text-sm text-muted-foreground">
          Google já ligado — vê na lista acima.
          {!googleAdsApiReady && (
            <span className="text-warning">
              {" "}
              Sync automático pendente (developer token).
            </span>
          )}
        </p>
      );
    }
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Google Ads ligado</p>
            <p className="mt-1 text-sm text-muted-foreground" data-sensitive>
              {googleAccount.accountName || googleAccount.externalAccountId}
              {googleAccount.linkedLoginEmail
                ? ` · ${googleAccount.linkedLoginEmail}`
                : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              ID {googleAccount.externalAccountId}
            </p>
            {!googleAdsApiReady && (
              <p className="mt-2 text-xs text-warning">
                Sync automático pendente — confirma GOOGLE_ADS_DEVELOPER_TOKEN no
                servidor. O gasto manual na tabela abaixo funciona na mesma.
              </p>
            )}
          </div>
          <DeleteAdAccountButton
            accountId={googleAccount.id}
            label="Desligar a conta Google Ads desta loja? O histórico de gasto manual mantém-se."
            onDeleted={onChanged}
          />
        </div>
      </div>
    );
  }

  const selected = discovered.find((a) => a.id === selectedId);

  const runDiscover = () => {
    if (!credentialId) return;
    setDiscoverError("");
    setManualMode(false);
    startDiscover(async () => {
      const res = await discoverGoogleCredentialAction(credentialId);
      if (res.error) {
        setDiscoverError(res.error);
        setDiscovered([]);
        setSelectedId("");
        return;
      }
      const accounts = res.google ?? [];
      setDiscovered(
        accounts.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
          loginCustomerId: a.loginCustomerId,
        })),
      );
      setSelectedId(accounts[0]?.id ?? "");
    });
  };

  const shellCls = embedded
    ? "space-y-3"
    : "rounded-lg border border-border bg-surface p-4";

  return (
    <div className={shellCls}>
      {!embedded && (
        <h3 className="text-sm font-semibold">Google Ads — esta loja</h3>
      )}
      {!embedded && (
      <p className="mt-1 text-xs text-muted-foreground">
        Escolhe o Gmail que aceitou o convite e o Customer ID (ou procura contas).
      </p>
      )}

      {workspaceGoogleLogins.length === 0 ? (
        <p className="mt-3 text-sm">
          <Link
            href="/definicoes#google-ads"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Definições → Google Ads
          </Link>{" "}
          — autoriza o Gmail uma vez. Depois volta aqui para escolher a conta.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {!googleAdsApiReady && (
            <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
              O servidor ainda não tem{" "}
              <strong className="font-medium text-foreground">
                GOOGLE_ADS_DEVELOPER_TOKEN
              </strong>{" "}
              (Vercel). Podes guardar a conta com o Customer ID abaixo — o sync
              automático só arranca quando o token estiver configurado. O gasto
              manual funciona sempre.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Gmail (workspace)
              </label>
              <select
                value={credentialId}
                onChange={(e) => {
                  setCredentialId(e.target.value);
                  setDiscovered([]);
                  setSelectedId("");
                  setDiscoverError("");
                  setManualMode(!googleAdsApiReady);
                }}
                className={inputCls}
              >
                {workspaceGoogleLogins.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.loginEmail}
                  </option>
                ))}
              </select>
            </div>
            {googleAdsApiReady && (
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={discovering || !credentialId}
                  onClick={runDiscover}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {discovering ? "A procurar…" : "Procurar contas Google Ads"}
                </button>
              </div>
            )}
          </div>

          {discoverError && (
            <p className="text-sm text-negative">{discoverError}</p>
          )}

          {discovered.length > 0 && !manualMode && (
            <p className="text-xs text-muted-foreground">
              Não vês a conta partilhada? Usa{" "}
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="text-accent underline-offset-2 hover:underline"
              >
                Customer ID manual
              </button>{" "}
              — o número no canto superior direito do Google Ads (ex: 962-828-5107).
              Confirma que o Gmail seleccionado é o que aceitou o convite.
            </p>
          )}

          {discovered.length > 0 && !manualMode && (
            <form action={action} className="space-y-3">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="platform" value="google" />
              <input type="hidden" name="replacePlatformAccount" value="true" />
              <input type="hidden" name="googleCredentialId" value={credentialId} />
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Conta Google Ads
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
                    </option>
                  ))}
                </select>
              </div>
              {selected && (
                <>
                  <input type="hidden" name="accountName" value={selected.name} />
                  {selected.loginCustomerId && (
                    <input
                      type="hidden"
                      name="googleLoginCustomerId"
                      value={selected.loginCustomerId}
                    />
                  )}
                </>
              )}
              {state.error && (
                <p className="text-sm text-negative">{state.error}</p>
              )}
              {state.ok && (
                <p className="text-sm text-positive">Conta Google ligada.</p>
              )}
              <button
                type="submit"
                disabled={pending || !selectedId}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "A ligar…" : "Ligar sync automático (opcional)"}
              </button>
            </form>
          )}

          {manualMode && (
            <div className="space-y-2">
              {discovered.length > 0 && (
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="text-xs text-accent underline-offset-2 hover:underline"
                >
                  Voltar à lista de contas
                </button>
              )}
              <form action={action} className="space-y-3">
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="platform" value="google" />
                <input type="hidden" name="replacePlatformAccount" value="true" />
                <input type="hidden" name="googleCredentialId" value={credentialId} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Customer ID (10 dígitos)
                  </label>
                  <input
                    name="externalAccountId"
                    required
                    inputMode="numeric"
                    placeholder="962-828-5107"
                    className={inputCls}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Número no canto superior direito do Google Ads (ex:{" "}
                    962-828-5107).
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    MCC / gestor (opcional)
                  </label>
                  <input
                    name="googleLoginCustomerId"
                    inputMode="numeric"
                    placeholder="ID da conta gestora"
                    className={inputCls}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Só se a conta foi partilhada via MCC — o Customer ID da conta
                    gestora (não o da loja). Pede ao dono da conta se não souberes.
                  </p>
                </div>
                {state.error && (
                  <p className="text-sm text-negative">{state.error}</p>
                )}
                {state.ok && (
                  <p className="text-sm text-positive">Conta Google ligada.</p>
                )}
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {pending ? "A ligar…" : "Ligar com ID manual"}
                </button>
              </form>
            </div>
          )}

          {googleAdsApiReady && !manualMode && (
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Ou introduzir Customer ID manualmente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
