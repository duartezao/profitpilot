"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PageTabCard, PageTabs, type PageTab } from "@/components/page-tabs";

const HASH_TO_TAB: Record<string, string> = {
  conta: "conta",
  convites: "equipa",
  convidar: "equipa",
  equipa: "equipa",
  "meus-workspaces": "workspace",
  "workspace-activo": "workspace",
  "lojas-workspaces": "workspace",
  lojas: "lojas",
  "google-ads": "integracoes",
  "capital-negocio": "integracoes",
};

export function DefinicoesTabs({
  showEquipa,
  storeCount,
  pendingInviteCount,
  panels,
}: {
  showEquipa: boolean;
  storeCount: number;
  pendingInviteCount: number;
  panels: {
    conta: ReactNode;
    workspace: ReactNode;
    equipa?: ReactNode;
    lojas: ReactNode;
    integracoes: ReactNode;
  };
}) {
  const tabs: PageTab[] = [
    { id: "conta", label: "Conta" },
    { id: "workspace", label: "Workspace" },
    ...(showEquipa
      ? [
          {
            id: "equipa",
            label: "Equipa",
            badge:
              pendingInviteCount > 0 ? (
                <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                  {pendingInviteCount}
                </span>
              ) : undefined,
          } satisfies PageTab,
        ]
      : []),
    {
      id: "lojas",
      label: "Lojas",
      badge:
        storeCount > 0 ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {storeCount}
          </span>
        ) : undefined,
    },
    { id: "integracoes", label: "Integrações" },
  ];

  const [tab, setTab] = useState("conta");

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && HASH_TO_TAB[hash]) {
      setTab(HASH_TO_TAB[hash]!);
    }
  }, []);

  function selectTab(id: string) {
    setTab(id);
    const hashEntry = Object.entries(HASH_TO_TAB).find(([, v]) => v === id);
    if (hashEntry) {
      window.history.replaceState(null, "", `#${hashEntry[0]}`);
    }
  }

  return (
    <div className="space-y-5">
      <PageTabs
        tabs={tabs}
        active={tab}
        onChange={selectTab}
        ariaLabel="Secções de definições"
      />

      {tab === "conta" && <PageTabCard>{panels.conta}</PageTabCard>}

      {tab === "workspace" && (
        <PageTabCard>
          <div className="space-y-8">{panels.workspace}</div>
        </PageTabCard>
      )}

      {tab === "equipa" && showEquipa && panels.equipa && (
        <PageTabCard>{panels.equipa}</PageTabCard>
      )}

      {tab === "lojas" && (
        <PageTabCard>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Lojas</h2>
            <p className="text-sm text-muted-foreground">
              Nome, sync, banca inicial, países das sessões, COGS e taxas — uma
              secção por loja.
            </p>
          </div>
          {panels.lojas}
        </PageTabCard>
      )}

      {tab === "integracoes" && (
        <PageTabCard>
          <div className="space-y-8">{panels.integracoes}</div>
        </PageTabCard>
      )}
    </div>
  );
}
