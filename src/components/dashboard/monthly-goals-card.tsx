"use client";

import type { MonthlyGoalsProgress } from "@/lib/monthly-goals";
import { formatCurrency } from "@/lib/utils";

export function MonthlyGoalsCard({ goals }: { goals: MonthlyGoalsProgress }) {
  const money = (v: number) => formatCurrency(v, goals.currency);
  const pace =
    goals.dayOfMonth > 0
      ? goals.daysInMonth / goals.dayOfMonth
      : 1;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">Metas do mês</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Dia {goals.dayOfMonth} de {goals.daysInMonth} · progresso MTD
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {goals.revenueGoal != null && goals.revenueGoal > 0 && (
          <GoalBar
            label="Receita"
            current={goals.revenueMtd}
            goal={goals.revenueGoal}
            fmt={money}
            pace={pace}
          />
        )}
        {goals.profitGoal != null && goals.profitGoal > 0 && (
          <GoalBar
            label="Lucro"
            current={goals.profitMtd}
            goal={goals.profitGoal}
            fmt={money}
            pace={pace}
          />
        )}
      </div>
    </div>
  );
}

function GoalBar({
  label,
  current,
  goal,
  fmt,
  pace,
}: {
  label: string;
  current: number;
  goal: number;
  fmt: (v: number) => string;
  pace: number;
}) {
  const pct = Math.min(100, (current / goal) * 100);
  const expectedPct = Math.min(100, (100 / pace));
  const onTrack = pct >= expectedPct * 0.9;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground" data-sensitive>
          {fmt(current)} / {fmt(goal)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${onTrack ? "bg-positive" : "bg-warning"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {pct.toFixed(0)}% da meta
        {!onTrack && " · ritmo abaixo do esperado"}
      </p>
    </div>
  );
}
