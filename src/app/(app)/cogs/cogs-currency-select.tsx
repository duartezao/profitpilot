"use client";

import { COGS_INPUT_CURRENCIES } from "@/lib/cogs-modes";

const selectCls =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

export function CogsCurrencySelect({
  name = "inputCurrency",
  defaultValue = "EUR",
  disabled,
}: {
  name?: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className={selectCls}
      aria-label="Moeda do COGS"
    >
      {COGS_INPUT_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
