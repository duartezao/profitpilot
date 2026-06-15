"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import type { SummaryStore } from "@/lib/metrics";

type SortKey = keyof SummaryStore["sort"];
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

export function StoresComparisonTable({ stores }: { stores: SummaryStore[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
    return [...stores].sort((a, b) => {
      const av = a.sort[sortKey];
      const bv = b.sort[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * mult;
    });
  }, [stores, sortKey, sortDir]);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">Lojas</h2>
        <p className="text-sm text-muted-foreground">Comparação por lucro.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3">Loja</th>
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
              <th className="px-5 py-3 text-right">Tendência</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.storeId} className="border-t border-border hover:bg-muted">
                <td className="px-5 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    <Sensitive>{s.name}</Sensitive>
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{s.revenue}</Sensitive>
                </td>
                <td
                  className={cn(
                    "px-5 py-3 text-right tabular-nums",
                    s.positive ? "text-positive" : "text-negative",
                  )}
                >
                  <Sensitive>{s.profit}</Sensitive>
                </td>
                <td
                  className={cn(
                    "px-5 py-3 text-right tabular-nums",
                    !s.positive && "text-negative",
                  )}
                >
                  <Sensitive>{s.margin}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{s.adSpend}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{s.roas}</Sensitive>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end" data-sensitive-chart>
                    <Sparkline data={s.trend} color={s.color} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
