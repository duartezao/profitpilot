export type CampaignAnalysisWindow = 5 | 7;

export type CampaignPerformanceBucket =
  | "no_conversions"
  | "marginal"
  | "performing";

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
  lastScale?: CampaignScaleSnapshot;
  postScale?: CampaignPostScaleSnapshot;
};

export type CampaignDecisionSection = {
  id: CampaignPerformanceBucket;
  title: string;
  description: string;
  rows: CampaignDecisionRow[];
};

export type CampaignDecisionAnalysis = {
  windowDays: CampaignAnalysisWindow;
  sections: CampaignDecisionSection[];
  agentExport: string;
  storeBerRoas: string | null;
  campaignCount: number;
};
