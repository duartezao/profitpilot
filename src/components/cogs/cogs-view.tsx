"use client";

import { useState, type ReactNode } from "react";
import { PageTabCard, PageTabs, type PageTab } from "@/components/page-tabs";

export function CogsView({
  mode,
  missingCount,
  main,
  csvImport,
  variantTable,
}: {
  mode: "order" | "day" | "variant" | null;
  missingCount: number;
  main: ReactNode;
  csvImport?: ReactNode;
  variantTable?: ReactNode;
}) {
  if (mode === "order" || mode === "day") {
    return <div className="space-y-5">{main}</div>;
  }

  if (mode === null) {
    return (
      <PageTabCard>
        <p className="text-sm text-muted-foreground">
          Selecciona uma loja no filtro para gerir COGS por dia ou por encomenda.
        </p>
      </PageTabCard>
    );
  }

  const tabs: PageTab[] = [
    {
      id: "sem-custo",
      label: "Sem custo",
      badge:
        missingCount > 0 ? (
          <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
            {missingCount}
          </span>
        ) : undefined,
    },
    { id: "importar", label: "Importar CSV" },
  ];

  const [tab, setTab] = useState("sem-custo");

  return (
    <div className="space-y-5">
      <PageTabs
        tabs={tabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Secções de COGS"
      />

      {tab === "sem-custo" && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {variantTable}
        </div>
      )}

      {tab === "importar" && <PageTabCard>{csvImport}</PageTabCard>}
    </div>
  );
}
