"use client";

import { useState, type ReactNode } from "react";
import { PageTabCard, PageTabs, type PageTab } from "@/components/page-tabs";

export function NotasView({
  scopeName,
  noteCount,
  relatorio,
  novaNota,
  historico,
}: {
  scopeName: string | null;
  noteCount: number;
  relatorio: ReactNode;
  novaNota: ReactNode;
  historico: ReactNode;
}) {
  const tabs: PageTab[] = [
    { id: "relatorio", label: "Relatório" },
    { id: "nova", label: "Nova nota" },
    {
      id: "historico",
      label: "Histórico",
      badge:
        noteCount > 0 ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {noteCount}
          </span>
        ) : undefined,
    },
  ];

  const [tab, setTab] = useState("relatorio");

  return (
    <div className="space-y-5">
      <PageTabs
        tabs={tabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Secções de notas"
      />

      {tab === "relatorio" && (
        <div className="space-y-4">{relatorio}</div>
      )}

      {tab === "nova" && (
        <PageTabCard>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Nova nota</h2>
            <p className="text-sm text-muted-foreground">
              {scopeName
                ? `Regista scale, humor ou observações do dia em ${scopeName}.`
                : "Regista scale, humor ou observações do dia."}
            </p>
          </div>
          {novaNota}
        </PageTabCard>
      )}

      {tab === "historico" && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Histórico</h2>
            <p className="text-sm text-muted-foreground">
              {scopeName
                ? `Últimas notas de ${scopeName}.`
                : "Últimas notas deste workspace."}
            </p>
          </div>
          {historico}
        </div>
      )}
    </div>
  );
}
