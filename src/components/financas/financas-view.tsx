"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { PageTabCard, PageTabs, type PageTab } from "@/components/page-tabs";

export function FinancasView({
  scopeName,
  hasStoreCash,
  hasStoreTable,
  expenseCount,
  resumo,
  storeCash,
  storeTable,
  expenses,
}: {
  scopeName: string | null;
  hasStoreCash: boolean;
  hasStoreTable: boolean;
  expenseCount: number;
  resumo: ReactNode;
  storeCash?: ReactNode;
  storeTable?: ReactNode;
  expenses: ReactNode;
}) {
  const tabs: PageTab[] = [
    { id: "resumo", label: "Resumo" },
    ...(hasStoreCash ? [{ id: "caixa", label: "Caixa" }] : []),
    ...(hasStoreTable ? [{ id: "lojas", label: "Por loja" }] : []),
    {
      id: "despesas",
      label: "Despesas",
      badge:
        expenseCount > 0 ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {expenseCount}
          </span>
        ) : undefined,
    },
  ];

  const [tab, setTab] = useState(tabs[0]!.id);

  return (
    <div className="space-y-5">
      <PageTabs
        tabs={tabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Secções de finanças"
      />

      {tab === "resumo" && <PageTabCard>{resumo}</PageTabCard>}

      {tab === "caixa" && hasStoreCash && storeCash && (
        <PageTabCard>{storeCash}</PageTabCard>
      )}

      {tab === "lojas" && hasStoreTable && storeTable && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {storeTable}
        </div>
      )}

      {tab === "despesas" && <PageTabCard>{expenses}</PageTabCard>}
    </div>
  );
}
