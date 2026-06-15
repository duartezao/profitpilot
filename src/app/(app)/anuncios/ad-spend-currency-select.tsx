"use client";

import { AD_INPUT_CURRENCIES } from "@/lib/ad-currencies";

const selectCls =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

export function AdSpendCurrencySelect({
  name = "inputCurrency",
  defaultValue = "USD",
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
      aria-label="Moeda do gasto"
    >
      {AD_INPUT_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
