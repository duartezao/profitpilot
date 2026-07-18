import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateCampaignPeriodTotals,
  campaignDayHasMetrics,
  isActiveCampaignStatus,
  isPausedCampaignStatus,
  shouldIncludeCampaignForDay,
  type LiveCampaignRow,
} from "../src/lib/ad-campaign-types.ts";

describe("campaign visibility per day", () => {
  it("activa aparece sem métricas", () => {
    assert.equal(shouldIncludeCampaignForDay("ENABLED", null), true);
    assert.equal(shouldIncludeCampaignForDay("ACTIVE", { spend: 0 }), true);
  });

  it("pausada só com actividade no dia", () => {
    assert.equal(shouldIncludeCampaignForDay("PAUSED", null), false);
    assert.equal(
      shouldIncludeCampaignForDay("PAUSED", { spend: 0, impressions: 0 }),
      false,
    );
    assert.equal(shouldIncludeCampaignForDay("PAUSED", { spend: 1 }), true);
    assert.equal(
      shouldIncludeCampaignForDay("CAMPAIGN_PAUSED", { clicks: 3 }),
      true,
    );
  });

  it("classifica estados activos e pausados", () => {
    assert.equal(isActiveCampaignStatus("ENABLED"), true);
    assert.equal(isPausedCampaignStatus("PAUSED"), true);
    assert.equal(isPausedCampaignStatus("CAMPAIGN_PAUSED"), true);
  });

  it("detecta métricas no dia", () => {
    assert.equal(campaignDayHasMetrics({ spend: 0 }), false);
    assert.equal(campaignDayHasMetrics({ impressions: 1 }), true);
  });
});

describe("aggregateCampaignPeriodTotals CPC/CPM", () => {
  it("CPC/CPM usam spend plataforma (sem fee); spend total inclui fee", () => {
    const campaigns: LiveCampaignRow[] = [
      {
        campaignId: "1",
        campaignName: "A",
        platform: "meta",
        platformLabel: "Meta",
        adAccountId: "acc",
        adAccountName: "Acc",
        status: "ACTIVE",
        statusLabel: "Activa",
        spend: 110,
        spendPlatform: 100,
        impressions: 10_000,
        clicks: 100,
        conversions: 0,
        conversionValue: 0,
        roas: null,
        currency: "EUR",
        cpc: null,
        ctr: null,
        cpm: null,
      },
    ];
    const t = aggregateCampaignPeriodTotals(campaigns, "EUR");
    assert.equal(t.spend, 110);
    assert.equal(t.cpc, 1);
    assert.equal(t.cpm, 10);
  });
});
