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
  showZeroOption = false,
}: {
  defaults?: PlatformDefaults;
  inputCurrency?: string;
  disabled?: boolean;
  compact?: boolean;
  showZeroOption?: boolean;
}) {
  const fieldCls = compact ? compactInputCls : inputCls;

  return (
    <div className="space-y-4">
      {showZeroOption && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <input
            type="checkbox"
            name="explicitZero"
            value="1"
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            <span className="text-sm font-medium">
              Sem gasto neste dia (0€ em todas as plataformas)
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Usa quando não correu ads em lado nenhum — o dia fica fechado a
              zero e deixa de aparecer em falta.
            </span>
          </span>
        </label>
      )}
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
        Preenche as plataformas que usaste ou marca «Sem gasto (0€)». Fee fixa
        e % aplicam-se sobre o gasto em ads de cada plataforma.
      </p>
    </div>
  );
}
