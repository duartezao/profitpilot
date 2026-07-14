"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ExportFormatLinks } from "@/components/export-format-links";
import type { AdSpendStoreView } from "@/lib/ad-spend-view";
import { AdSpendForm } from "@/app/(app)/anuncios/ad-spend-form";
import { AdSpendRow } from "@/app/(app)/anuncios/ad-spend-row";
import { AdAccountsPanel } from "@/components/anuncios/ad-accounts-panel";
import { GoogleAdsStoreLink } from "@/components/anuncios/google-ads-store-link";
import { CampaignsPanel } from "@/components/anuncios/campaigns-panel";
import { LastSyncBadge } from "@/components/last-sync-badge";
import { PageTabCard, PageTabs } from "@/components/page-tabs";
import { DeleteAdAccountButton } from "@/components/anuncios/delete-ad-account-button";
import { AdAccountFeesForm } from "@/components/anuncios/ad-account-fees-form";
import { cn } from "@/lib/utils";

type TabId = "gasto" | "contas" | "campanhas" | "historico";

const TABS: { id: TabId; label: string }[] = [
  { id: "gasto", label: "Gasto manual" },
  { id: "contas", label: "Contas API" },
  { id: "campanhas", label: "Campanhas" },
  { id: "historico", label: "Histórico" },
];

export function AnunciosStoreView({
  store: s,
  lastSyncedAt,
  isFetching,
  onDataChanged,
}: {
  store: AdSpendStoreView;
  lastSyncedAt?: string | null;
  isFetching: boolean;
  onDataChanged: () => void;
}) {
  const [tab, setTab] = useState<TabId>("gasto");
  const googleAccount = s.adAccounts.find((a) => a.platform === "google");
  const apiCount = s.adAccounts.length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Anúncios · <span data-sensitive>{s.storeName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Regista o gasto diário e, se quiseres, liga contas para sync automático.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LastSyncBadge lastSyncedAt={lastSyncedAt} fetching={isFetching} />
          <ExportFormatLinks
            href={`/api/export/ad-spend?store=${encodeURIComponent(s.storeId)}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Dias em falta"
          value={String(s.missingCount)}
          tone={s.missingCount > 0 ? "warning" : "ok"}
          onClick={() => setTab("historico")}
        />
        <SummaryCard
          label="Ontem"
          value={s.yesterdayMissing ? "Em falta" : "OK"}
          tone={s.yesterdayMissing ? "warning" : "ok"}
          onClick={() => setTab("gasto")}
        />
        <SummaryCard
          label="Contas API"
          value={String(apiCount)}
          tone={apiCount > 0 ? "ok" : "muted"}
          onClick={() => setTab("contas")}
        />
        <SummaryCard
          label="Moeda base"
          value={s.baseCurrency}
          tone="muted"
        />
      </div>

      {s.missingCount > 0 && tab !== "gasto" && (
        <button
          type="button"
          onClick={() => setTab("gasto")}
          className="flex w-full items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-left text-sm hover:bg-warning/10"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <span>
            <strong>{s.missingCount}</strong>{" "}
            {s.missingCount === 1 ? "dia em falta" : "dias em falta"}
            {s.yesterdayMissing ? " — incluindo ontem" : ""}. Regista em Gasto
            manual.
          </span>
        </button>
      )}

      <PageTabs
        tabs={TABS}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        ariaLabel="Secções de anúncios"
      />

      <PageTabCard>
        {tab === "gasto" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Gasto manual</h2>
              <p className="text-sm text-muted-foreground">
                O que entra no lucro — Meta, Google e TikTok por dia. Sugestão:
                ontem ({s.yesterday}). Hoje ({s.today}) actualiza via API se
                tiveres contas ligadas.
              </p>
            </div>
            <AdSpendForm
              storeId={s.storeId}
              storeName={s.storeName}
              baseCurrency={s.baseCurrency}
              defaultDate={s.yesterday}
              todayKey={s.today}
              apiLinkedPlatforms={s.adAccounts.map((a) => a.platform)}
              minDate={s.minDate}
              canEdit={s.canEdit}
              onSaved={onDataChanged}
              embedded
            />
          </div>
        )}

        {tab === "contas" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Contas API</h2>
              <p className="text-sm text-muted-foreground">
                Opcional — puxa gasto e campanhas automaticamente. Ao trocar de
                conta, desliga a antiga: o histórico fica na BD; o sync usa a
                conta mais recente por plataforma. O Gmail Google autoriza-se uma
                vez em{" "}
                <Link
                  href="/definicoes#google-ads"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Definições
                </Link>
                .
              </p>
            </div>

            {s.adAccounts.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {s.adAccounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.platformLabel}</p>
                      <p className="text-sm text-muted-foreground" data-sensitive>
                        {a.accountName || a.externalAccountId}
                      </p>
                      {a.linkedLoginEmail && (
                        <p className="text-xs text-muted-foreground" data-sensitive>
                          {a.linkedLoginEmail}
                        </p>
                      )}
                      {(a.apiExtraFeeFixed > 0 || a.apiAgencyFeePercent > 0) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fees:{" "}
                          {a.apiExtraFeeFixed > 0
                            ? `${a.apiExtraFeeFixed.toFixed(2)} fixo`
                            : ""}
                          {a.apiExtraFeeFixed > 0 && a.apiAgencyFeePercent > 0
                            ? " + "
                            : ""}
                          {a.apiAgencyFeePercent > 0
                            ? `${a.apiAgencyFeePercent}%`
                            : ""}
                        </p>
                      )}
                      {a.lastSyncError && (
                        <p className="mt-1 text-xs text-negative">
                          {a.lastSyncError}
                        </p>
                      )}
                      {s.canEdit && (
                        <AdAccountFeesForm
                          account={a}
                          onSaved={onDataChanged}
                        />
                      )}
                    </div>
                    {s.canEdit && (
                      <DeleteAdAccountButton
                        accountId={a.id}
                        onDeleted={onDataChanged}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Ligar Google Ads</h3>
              <GoogleAdsStoreLink
                storeId={s.storeId}
                canEdit={s.canEdit}
                workspaceGoogleLogins={s.workspaceGoogleLogins}
                googleAdsApiReady={s.googleAdsApiReady}
                googleAccount={googleAccount}
                onChanged={onDataChanged}
                embedded
              />
            </div>

            <div className="space-y-4 border-t border-border pt-6">
              <h3 className="text-sm font-semibold">Ligar Meta ou TikTok</h3>
              <AdAccountsPanel
                storeId={s.storeId}
                accounts={s.adAccounts}
                canEdit={s.canEdit}
                onChanged={onDataChanged}
                embedded
              />
            </div>
          </div>
        )}

        {tab === "campanhas" && (
          <CampaignsPanel
            storeId={s.storeId}
            hasLinkedAccounts={apiCount > 0}
            adApiQuotaPaused={s.adApiQuotaPaused}
            embedded
          />
        )}

        {tab === "historico" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Histórico diário</h2>
              <p className="text-sm text-muted-foreground">
                {s.calendar.length} dias desde importação · {s.missingCount} em
                falta
              </p>
            </div>
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3 sm:px-5">Dia</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">
                      Total ({s.baseCurrency})
                    </th>
                    <th className="px-4 py-3 w-28">Ação</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {s.calendar.map((row) => (
                    <AdSpendRow
                      key={`${row.dateKey}-${row.revisionAt ?? "new"}`}
                      row={row}
                      storeId={s.storeId}
                      canEdit={s.canEdit}
                      onChanged={onDataChanged}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageTabCard>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone: "ok" | "warning" | "muted";
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "ok" && "text-foreground",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-border bg-surface p-3 text-left hover:bg-muted/50 sm:p-4"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 sm:p-4">
      {inner}
    </div>
  );
}
