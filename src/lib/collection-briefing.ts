/**
 * Nome base da campanha: tira prefixo de data (`04-07 - `) e sufixos #2, #3, etc.
 * Ex. "04-07 - Mocassins #3" → "Mocassins"
 * Ex. "robes-d-ete #2" → "robes-d-ete"
 */
export function normalizeCampaignBaseName(name: string): string {
  return String(name ?? "")
    .trim()
    // Prefixo data: 04-07 -, 04/07 -, 2026-04-07 -, 4-7 -
    .replace(
      /^\d{1,4}([./-]\d{1,2}){1,2}\s*[-–—:|]\s*/i,
      "",
    )
    .replace(/\s*#\s*\d+\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/i, "")
    .replace(/\s*[-–—]\s*\d+\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function uniqueCampaignBaseNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const base = normalizeCampaignBaseName(n);
    if (!base) continue;
    const key = base.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(base);
  }
  return out;
}

export type CollectionBriefingInput = {
  periodFromLabel: string;
  periodToLabel: string;
  adAccount: string;
  storeDomain: string;
  campaignNames: string[];
  revenueFmt: string;
  spendFmt: string;
  roasFmt: string;
  collectionTitle: string;
};

/** Mensagem EN pronta a colar para o media buyer / coach. */
export function buildCollectionBriefingMessage(
  input: CollectionBriefingInput,
): string {
  const bases = uniqueCampaignBaseNames(input.campaignNames);
  const campaign =
    bases.length > 0 ? bases.join(", ") : input.collectionTitle || "—";
  const ad = input.adAccount.trim() || "—";
  const store = input.storeDomain.trim() || "—";
  const roas = input.roasFmt === "—" ? "n/a" : input.roasFmt;

  return [
    `Day ${input.periodFromLabel} to ${input.periodToLabel}`,
    `Ad account: ${ad}`,
    `Store: ${store}`,
    `Campaign: ${campaign}`,
    `Had ${input.revenueFmt} rev and ${input.spendFmt} spend, so overall collection ROAS is ${roas}.`,
  ].join("\n");
}

/** Junta os briefings de todas as coleções da loja num bloco só. */
export function joinStoreBriefingMessages(messages: string[]): string {
  return messages
    .map((m) => m.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

