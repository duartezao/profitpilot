export const RESEARCH_KINDS = ["product", "collection"] as const;
export type ResearchKind = (typeof RESEARCH_KINDS)[number];

export const RESEARCH_GENDERS = [
  "female",
  "male",
  "unisex",
  "unknown",
] as const;
export type ResearchGender = (typeof RESEARCH_GENDERS)[number];

export const RESEARCH_STATUSES = [
  "new",
  "shortlist",
  "testing",
  "winner",
  "rejected",
] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const RESEARCH_KIND_LABEL: Record<ResearchKind, string> = {
  product: "Produto",
  collection: "Coleção",
};

export const RESEARCH_GENDER_LABEL: Record<ResearchGender, string> = {
  female: "Mulher",
  male: "Homem",
  unisex: "Unissex",
  unknown: "—",
};

export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  new: "Novo",
  shortlist: "Shortlist",
  testing: "A testar",
  winner: "Winner",
  rejected: "Descartado",
};

export function normalizeResearchKind(v: string): ResearchKind {
  return v === "collection" ? "collection" : "product";
}

export function normalizeResearchGender(v: string): ResearchGender {
  if (v === "female" || v === "male" || v === "unisex") return v;
  return "unknown";
}

export function normalizeResearchStatus(v: string): ResearchStatus {
  if (
    v === "shortlist" ||
    v === "testing" ||
    v === "winner" ||
    v === "rejected"
  ) {
    return v;
  }
  return "new";
}
