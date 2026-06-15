/** Plataformas de ads suportadas no registo manual. */
import { parseLocaleNumberOrZero } from "@/lib/parse-number";
export const AD_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: "Meta (Facebook / Instagram)",
  google: "Google",
  tiktok: "TikTok",
};

export type AdSpendLineInput = {
  platform: AdPlatform;
  spend: number;
  extraFeeFixed: number;
  agencyFeePercent: number;
};

export type AdSpendLineStored = {
  platform: AdPlatform;
  inputAmount: number;
  inputCurrency: string;
  amount: number;
  fxRate: number | null;
  extraFee: number;
  inputExtraFee: number | null;
  agencyFeePercent: number;
  agencyFeeAmount: number;
  inputAgencyFeeAmount: number | null;
};

export function adSpendLineTotalBase(
  line: Pick<AdSpendLineStored, "amount" | "extraFee" | "agencyFeeAmount">,
): number {
  return (
    line.amount + (line.extraFee ?? 0) + (line.agencyFeeAmount ?? 0)
  );
}

export function parsePlatformInputs(
  formData: FormData,
): AdSpendLineInput[] {
  const out: AdSpendLineInput[] = [];
  for (const platform of AD_PLATFORMS) {
    const spend = parseNum(formData.get(`${platform}_spend`));
    const extraFeeFixed = parseNum(formData.get(`${platform}_extraFee`));
    const agencyFeePercent = parseNum(formData.get(`${platform}_agencyPercent`));
    if (spend > 0 || extraFeeFixed > 0 || agencyFeePercent > 0) {
      out.push({ platform, spend, extraFeeFixed, agencyFeePercent });
    }
  }
  return out;
}

/** Valores por defeito para o formulário a partir de linhas guardadas. */
export function platformDefaultsFromLines(
  lines: AdSpendLineStored[],
): {
  defaults: Partial<
    Record<
      AdPlatform,
      { spend?: string; extraFee?: string; agencyPercent?: string }
    >
  >;
  inputCurrency: string;
} {
  const defaults: Partial<
    Record<
      AdPlatform,
      { spend?: string; extraFee?: string; agencyPercent?: string }
    >
  > = {};
  let inputCurrency = "USD";
  for (const line of lines) {
    inputCurrency = line.inputCurrency || inputCurrency;
    defaults[line.platform] = {
      spend: line.inputAmount > 0 ? String(line.inputAmount) : "",
      extraFee:
        line.inputExtraFee != null && line.inputExtraFee > 0
          ? String(line.inputExtraFee)
          : "",
      agencyPercent:
        line.agencyFeePercent > 0 ? String(line.agencyFeePercent) : "",
    };
  }
  return { defaults, inputCurrency };
}

export function parseNum(raw: FormDataEntryValue | null): number {
  if (raw === "" || raw == null) return 0;
  const n = parseLocaleNumberOrZero(raw);
  return n >= 0 ? n : 0;
}
