export type CampaignAnalysisWindow = 5 | 7;

export type CampaignPerformanceBucket =
  | "no_conversions"
  | "marginal"
  | "performing";

/** Secções da página Decisão (vista para o media buyer). */
export type CampaignDecisionViewSection =
  | "pause"
  | "testing"
  | "performing"
  | "watch";

export type CampaignPauseCause = "no_sales" | "below_ber";

export type CampaignDecisionStatus =
  | "kill"
  | "pause"
  | "maintain"
  | "scale"
  | "testing";

export type CampaignScaleSnapshot = {
  dateKey: string;
  fromBudget: number;
  toBudget: number;
  currency: string;
  preSpendDays: number;
  preSpend: number;
  preConversions: number;
  preRoas: number | null;
};

export type CampaignPostScaleSnapshot = {
  spendDays: number;
  spend: number;
  conversions: number;
  roas: number | null;
  verdict: "better" | "worse" | "same" | "early";
};

export type CampaignPauseSnapshot = {
  dateKey: string;
  preSpendDays: number;
  preSpend: number;
  preConversions: number;
  preRoas: number | null;
  preAccountRoas: number | null;
};

export type CampaignPostPauseAccountSnapshot = {
  accountSpendDays: number;
  accountSpend: number;
  accountConversions: number;
  accountRoas: number | null;
  campaignSpend: number;
  verdict: "better" | "worse" | "same" | "early";
};

export type CampaignDecisionRow = {
  campaignId: string;
  adAccountId: string;
  adAccountName: string;
  name: string;
  platform: string;
  platformLabel: string;
  bucket: CampaignPerformanceBucket;
  status: CampaignDecisionStatus;
  statusLabel: string;
  spendDays: number;
  spendDaysRequired: number;
  hasFullWindow: boolean;
  /** Gasto parou há mais de 1 dia — ciclo de análise reinicia. */
  staleSpend?: boolean;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: string;
  roasValue: number | null;
  berRoas: number | null;
  cpc: number | null;
  ctr: number | null;
  reason: string;
  agentBrief: string;
  viewSection: CampaignDecisionViewSection;
  pauseCause?: CampaignPauseCause;
  lastScale?: CampaignScaleSnapshot;
  postScale?: CampaignPostScaleSnapshot;
  lastPause?: CampaignPauseSnapshot;
  postPauseAccount?: CampaignPostPauseAccountSnapshot;
};

export type CampaignDecisionSection = {
  id: CampaignDecisionViewSection;
  title: string;
  description: string;
  rows: CampaignDecisionRow[];
};

export type CampaignDecisionAnalysis = {
  windowDays: CampaignAnalysisWindow;
  sections: CampaignDecisionSection[];
  mediaBuyerPauseMessage: string | null;
  agentExport: string;
  storeBerRoas: string | null;
  campaignCount: number;
};
