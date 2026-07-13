import type {
  CampaignAnalysisWindow,
  CampaignDecisionAnalysis,
  CampaignDecisionRow,
} from "@/lib/campaign-analysis-core-types";

export type {
  CampaignAnalysisWindow,
  CampaignPerformanceBucket,
  CampaignDecisionViewSection,
  CampaignPauseCause,
  CampaignDecisionStatus,
  CampaignScaleSnapshot,
  CampaignPostScaleSnapshot,
  CampaignPauseSnapshot,
  CampaignPostPauseAccountSnapshot,
  CampaignDecisionRow,
  CampaignDecisionSection,
  CampaignDecisionAnalysis,
} from "@/lib/campaign-analysis-core-types";

export type DecisionStatus = "scale" | "maintain" | "kill";

export type DecisionRow = {
  name: string;
  kind: "product" | "store";
  status: DecisionStatus;
  statusLabel: string;
  roas: string;
  ber: string;
  margin: string;
  spend: string;
};

export type TodayAction = {
  level: "positive" | "warning" | "negative";
  text: string;
};

export type RecentScaleEvent = {
  campaignName: string;
  adAccountName: string;
  platform: string;
  dateKey: string;
  previousBudget: number;
  newBudget: number;
  currency: string;
  preRoas: number | null;
  preConversions: number;
};

export type RecentPauseEvent = {
  campaignName: string;
  adAccountName: string;
  platform: string;
  dateKey: string;
  preRoas: number | null;
  preConversions: number;
  preAccountRoas: number | null;
  postPause?: {
    accountSpendDays: number;
    accountRoas: number | null;
    verdict: "better" | "worse" | "same" | "early";
    campaignSpend: number;
  };
};

export type DecisionSummary = {
  scopeName: string | null;
  periodLabel: string;
  actions: TodayAction[];
  rows: DecisionRow[];
  campaignRows: CampaignDecisionRow[];
  campaignAnalysis: CampaignDecisionAnalysis | null;
  analysisWindowDays: CampaignAnalysisWindow;
  recentScales: RecentScaleEvent[];
  recentPauses: RecentPauseEvent[];
  storeBerRoas: string | null;
  agentExport: string | null;
  treasury: {
    available: string;
    incoming: string;
    payable: string;
    projected: string;
    projectedTitle: string;
    currency: string;
  } | null;
  generatedAt: string;
};

export function parseAnalysisWindow(raw?: string | null): CampaignAnalysisWindow {
  return raw === "5" ? 5 : 7;
}
