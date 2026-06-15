"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Trophy } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";
import type { SummaryWorkspace } from "@/lib/portfolio-metrics";

type SortKey = keyof SummaryWorkspace["sort"];
type SortDir = "asc" | "desc";

function SortButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </button>
  );
}

export function WorkspacesComparisonTable({
  workspaces,
  displayCurrency,
}: {
  workspaces: SummaryWorkspace[];
  displayCurrency: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const top = workspaces.find((w) => w.profitRank === 1);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...workspaces].sort((a, b) => {
      const av = a.sort[sortKey];
      const bv = b.sort[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * mult;
    });
  }, [workspaces, sortKey, sortDir]);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">Workspaces</h2>
        <p className="text-sm text-muted-foreground">
          Comparação de rentabilidade · valores em {displayCurrency}.
        </p>
        {top && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 text-positive" />
            Mais rentável:{" "}
            <Sensitive as="span" className="font-medium text-foreground">
              {top.name}
            </Sensitive>
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3">Workspace</th>
              <th className="px-5 py-3 text-right">Lojas</th>
              <th className="px-5 py-3 text-right">
                <SortButton
                  label="Revenue"
                  active={sortKey === "revenue"}
                  dir={sortDir}
                  onClick={() => toggleSort("revenue")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right">
                <SortButton
                  label="Lucro"
                  active={sortKey === "profit"}
                  dir={sortDir}
                  onClick={() => toggleSort("profit")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right">
                <SortButton
                  label="Margem"
                  active={sortKey === "margin"}
                  dir={sortDir}
                  onClick={() => toggleSort("margin")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right">
                <SortButton
                  label="Ad Spend"
                  active={sortKey === "adSpend"}
                  dir={sortDir}
                  onClick={() => toggleSort("adSpend")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right">
                <SortButton
                  label="ROAS"
                  active={sortKey === "roas"}
                  dir={sortDir}
                  onClick={() => toggleSort("roas")}
                  className="ml-auto"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => (
              <tr
                key={w.workspaceId}
                className="border-t border-border hover:bg-muted"
              >
                <td className="px-5 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: w.color }}
                      aria-hidden
                    />
                    <Sensitive>{w.name}</Sensitive>
                    {w.profitRank === 1 && (
                      <span className="rounded-md border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-positive">
                        Top
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                  {w.storeCount}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{w.revenue}</Sensitive>
                </td>
                <td
                  className={cn(
                    "px-5 py-3 text-right tabular-nums",
                    w.positive ? "text-positive" : "text-negative",
                  )}
                >
                  <Sensitive>{w.profit}</Sensitive>
                </td>
                <td
                  className={cn(
                    "px-5 py-3 text-right tabular-nums",
                    !w.positive && "text-negative",
                  )}
                >
                  <Sensitive>{w.margin}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{w.adSpend}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{w.roas}</Sensitive>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
