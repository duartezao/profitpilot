import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  campaignDayHasMetrics,
  isActiveCampaignStatus,
  isPausedCampaignStatus,
  shouldIncludeCampaignForDay,
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
