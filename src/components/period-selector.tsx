"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, Check, Plus, X } from "lucide-react";
import {
  PERIOD_PRESETS,
  activePeriodMode,
  formatDateInput,
  MAX_SPECIFIC_DATES,
  periodFromSearchParams,
  shortPeriodLabel,
  type PeriodPresetId,
} from "@/lib/period";
import { cn } from "@/lib/utils";

const itemCls =
  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted";

const inputCls =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

const btnSecondaryCls =
  "rounded-md border border-border px-2 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60";

const btnPrimaryCls =
  "w-full rounded-md bg-accent px-2 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60";

export function PeriodSelector({
  className,
  fullWidth = false,
}: {
  className?: string;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState("");
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [datesError, setDatesError] = useState<string | null>(null);

  const period = periodFromSearchParams(params);
  const active = activePeriodMode(params);
  const label = period.label;
  const shortLabel = shortPeriodLabel(period);

  useEffect(() => {
    if (active === "custom") {
      setCustomFrom(params.get("from") ?? "");
      setCustomTo(params.get("to") ?? "");
    }
    if (active === "dates") {
      const raw = params.get("dates") ?? "";
      setSpecificDates(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
  }, [active, params]);

  function navigate(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  }

  function clearPeriodParams(next: URLSearchParams) {
    next.delete("period");
    next.delete("from");
    next.delete("to");
    next.delete("dates");
  }

  function selectPreset(id: PeriodPresetId) {
    const next = new URLSearchParams(params.toString());
    clearPeriodParams(next);
    next.set("period", id);
    setCustomError(null);
    setDatesError(null);
    navigate(next);
  }

  function applyCustom() {
    if (!customFrom || !customTo) {
      setCustomError("Escolhe as duas datas.");
      return;
    }
    const next = new URLSearchParams(params.toString());
    clearPeriodParams(next);
    next.set("from", customFrom);
    next.set("to", customTo);

    const test = periodFromSearchParams(next);
    if (test.preset !== "custom") {
      setCustomError("Período inválido (máx. 366 dias).");
      return;
    }

    setCustomError(null);
    navigate(next);
  }

  function addSpecificDate() {
    setDatesError(null);
    if (!pickDate) {
      setDatesError("Escolhe uma data.");
      return;
    }
    if (specificDates.includes(pickDate)) {
      setDatesError("Esse dia já está na lista.");
      return;
    }
    if (specificDates.length >= MAX_SPECIFIC_DATES) {
      setDatesError(`Máximo ${MAX_SPECIFIC_DATES} dias.`);
      return;
    }
    setSpecificDates((prev) => [...prev, pickDate].sort());
    setPickDate("");
  }

  function removeSpecificDate(date: string) {
    setSpecificDates((prev) => prev.filter((d) => d !== date));
    setDatesError(null);
  }

  function applySpecificDates() {
    if (specificDates.length === 0) {
      setDatesError("Adiciona pelo menos um dia.");
      return;
    }
    const next = new URLSearchParams(params.toString());
    clearPeriodParams(next);
    next.set("dates", specificDates.join(","));

    const test = periodFromSearchParams(next);
    if (test.preset !== "dates") {
      setDatesError("Seleção inválida.");
      return;
    }

    setDatesError(null);
    navigate(next);
  }

  function applySingleDay() {
    setDatesError(null);
    if (!pickDate) {
      setDatesError("Escolhe um dia.");
      return;
    }
    const next = new URLSearchParams(params.toString());
    clearPeriodParams(next);
    next.set("dates", pickDate);

    const test = periodFromSearchParams(next);
    if (test.preset !== "dates") {
      setDatesError("Data inválida.");
      return;
    }

    navigate(next);
  }

  function formatChipDate(iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("pt-PT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const todayIso = formatDateInput(new Date());

  return (
    <div className={cn("relative z-50 min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted",
          fullWidth && "w-full min-w-0",
        )}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            !fullWidth && "hidden max-w-[10rem] sm:inline",
          )}
          title={label}
        >
          {fullWidth ? shortLabel : label}
        </span>
        {!fullWidth && (
          <span className="truncate sm:hidden">{shortLabel}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/20 dark:bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(
              "absolute z-[110] mt-1 max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-sm",
              fullWidth
                ? "left-0 right-0 w-auto"
                : "right-0 w-[min(20rem,calc(100vw-1.5rem))] sm:w-80",
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              Período
            </p>
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={itemCls}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPreset(p.id)}
              >
                <span>{p.label}</span>
                {active === p.id && (
                  <Check className="h-4 w-4 shrink-0 text-accent" />
                )}
              </button>
            ))}

            <div className="my-1 border-t border-border" />

            <div className="space-y-2 p-2">
              <p className="text-xs font-medium text-muted-foreground">
                Dia específico
              </p>
              <input
                type="date"
                value={pickDate}
                max={todayIso}
                onChange={(e) => setPickDate(e.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                className={btnPrimaryCls}
                onClick={applySingleDay}
              >
                Ver este dia
              </button>
              {active === "dates" &&
                period.specificDates?.length === 1 && (
                  <p className="text-center text-xs text-muted-foreground">
                    {label}
                  </p>
                )}
            </div>

            <div className="my-1 border-t border-border" />

            <div className="space-y-2 p-2">
              <p className="text-xs font-medium text-muted-foreground">
                Vários dias específicos
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={pickDate}
                  max={todayIso}
                  onChange={(e) => setPickDate(e.target.value)}
                  className={inputCls}
                />
                <button
                  type="button"
                  aria-label="Adicionar dia"
                  className={`${btnSecondaryCls} shrink-0 px-2.5`}
                  onClick={addSpecificDate}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {specificDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {specificDates.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs tabular-nums"
                    >
                      {formatChipDate(d)}
                      <button
                        type="button"
                        aria-label={`Remover ${d}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removeSpecificDate(d)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {datesError && (
                <p className="text-xs text-negative">{datesError}</p>
              )}
              <button
                type="button"
                className={btnPrimaryCls}
                disabled={specificDates.length === 0}
                onClick={applySpecificDates}
              >
                Aplicar {specificDates.length > 0 ? `(${specificDates.length})` : ""}
              </button>
              {active === "dates" &&
                (period.specificDates?.length ?? 0) > 1 && (
                  <p className="text-center text-xs text-muted-foreground">
                    {label}
                  </p>
                )}
            </div>

            <div className="my-1 border-t border-border" />

            <div className="space-y-2 p-2">
              <p className="text-xs font-medium text-muted-foreground">
                Intervalo contínuo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">
                    De
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    max={todayIso}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">
                    Até
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    max={todayIso}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              {customError && (
                <p className="text-xs text-negative">{customError}</p>
              )}
              <button type="button" className={btnPrimaryCls} onClick={applyCustom}>
                Aplicar intervalo
              </button>
              {active === "custom" && (
                <p className="text-center text-xs text-muted-foreground">
                  {label}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
