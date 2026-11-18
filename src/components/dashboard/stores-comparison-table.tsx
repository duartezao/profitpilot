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
    <div className="glass min-w-0 overflow-hidden rounded-[20px]">
      <div className="px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Lojas</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3 sm:px-6">Loja</th>
              <th className="px-5 py-3 text-right sm:px-6">
                <SortButton
                  label="Revenue"
                  active={sortKey === "revenue"}
                  dir={sortDir}
                  onClick={() => toggleSort("revenue")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right sm:px-6">
                <SortButton
                  label="Lucro"
                  active={sortKey === "profit"}
                  dir={sortDir}
                  onClick={() => toggleSort("profit")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right sm:px-6">
                <SortButton
                  label="Margem"
                  active={sortKey === "margin"}
                  dir={sortDir}
                  onClick={() => toggleSort("margin")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right sm:px-6">
                <SortButton
                  label="Ad Spend"
                  active={sortKey === "adSpend"}
                  dir={sortDir}
                  onClick={() => toggleSort("adSpend")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right sm:px-6">
                <SortButton
                  label="ROAS"
                  active={sortKey === "roas"}
                  dir={sortDir}
                  onClick={() => toggleSort("roas")}
                  className="ml-auto"
                />
              </th>
              <th className="px-5 py-3 text-right sm:px-6">Tendência</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.storeId}
                className="border-t border-border/60 transition-colors hover:bg-muted/60"
              >
                <td className="px-5 py-3.5 font-medium sm:px-6">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    <Sensitive>{s.name}</Sensitive>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums sm:px-6">
                  <Sensitive>{s.revenue}</Sensitive>
                </td>
                <td
                  className={cn(
                    "px-5 py-3.5 text-right tabular-nums sm:px-6",
                    s.positive ? "text-positive" : "text-negative",
                  )}
                >
                  <Sensitive>{s.profit}</Sensitive>
                </td>
                <td
                  className={cn(
                    "px-5 py-3.5 text-right tabular-nums sm:px-6",
                    !s.positive && "text-negative",
                  )}
                >
                  <Sensitive>{s.margin}</Sensitive>
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums sm:px-6">
                  <Sensitive>{s.adSpend}</Sensitive>
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums sm:px-6">
                  <Sensitive>{s.roas}</Sensitive>
                </td>
                <td className="px-5 py-3.5 sm:px-6">
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
