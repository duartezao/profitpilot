"use client";

import {
  AD_PLATFORMS,
  AD_PLATFORM_LABELS,
  type AdPlatform,
} from "@/lib/ad-spend-platforms";
import { AdSpendCurrencySelect } from "./ad-spend-currency-select";
import { DecimalInput } from "@/components/decimal-input";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";
const compactInputCls =
  "w-full min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent disabled:opacity-60";

export type PlatformDefaults = Partial<
  Record<
    AdPlatform,
    {
      spend?: string;
      extraFee?: string;
      agencyPercent?: string;
    }
  >
>;

export function AdSpendPlatformFields({
  defaults = {},
  inputCurrency,
  disabled = false,
  compact = false,
}: {
  defaults?: PlatformDefaults;
  inputCurrency?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const fieldCls = compact ? compactInputCls : inputCls;

  return (
    <div className="space-y-4">
      {AD_PLATFORMS.map((platform) => {
        const d = defaults[platform];
        return (
          <fieldset
            key={platform}
            className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4"
          >
            <legend className="px-1 text-sm font-medium">
              {AD_PLATFORM_LABELS[platform]}
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Gasto em ads</label>
                <DecimalInput
                  name={`${platform}_spend`}
                  defaultValue={d?.spend ?? ""}
                  disabled={disabled}
                  placeholder="0,00"
                  className={fieldCls}
                  data-sensitive
                />
              </div>
              <div>
                <label className={labelCls}>Fee fixa (agência)</label>
                <DecimalInput
                  name={`${platform}_extraFee`}
                  defaultValue={d?.extraFee ?? ""}
                  disabled={disabled}
                  placeholder="0,00"
                  className={fieldCls}
                  data-sensitive
                />
              </div>
              <div>
                <label className={labelCls}>Fee % sobre o gasto</label>
                <div className="relative">
                  <DecimalInput
                    name={`${platform}_agencyPercent`}
                    defaultValue={d?.agencyPercent ?? ""}
                    disabled={disabled}
                    placeholder="0"
                    className={`${fieldCls} pr-7`}
                    data-sensitive
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>
          </fieldset>
        );
      })}
      <div className="max-w-xs">
        <label className={labelCls}>Moeda dos valores acima</label>
        <AdSpendCurrencySelect
          defaultValue={inputCurrency ?? "USD"}
          disabled={disabled}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Preenche só as plataformas que usaste nesse dia. Fee fixa e % aplicam-se
        sobre o gasto em ads de cada plataforma — convertem para a moeda base do
        workspace e somam ao total do dia.
      </p>
    </div>
  );
}
