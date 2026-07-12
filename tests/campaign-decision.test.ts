import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignDecisions,
  CAMPAIGN_EXTENDED_TEST_DAYS,
  CAMPAIGN_TEST_PHASE_DAYS,
} from "../src/lib/campaign-decision.ts";
import type { CampaignDayMetrics } from "../src/lib/ad-campaign-metrics.ts";

function baseCampaign(
  overrides: Partial<CampaignDayMetrics> = {},
): CampaignDayMetrics {
  return {
    campaignId: "c1",
    campaignName: "Teste",
    platform: "meta",
    platformLabel: "Meta",
    spend: 100,
    impressions: 1000,
    clicks: 50,
    conversions: 0,
    conversionValue: 0,
    roas: null,
    currency: "EUR",
    cpc: 2,
    ctr: 5,
    cpm: 10,
    isActiveCampaign: true,
    ...overrides,
  };
}

describe("buildCampaignDecisions — ciclo 7/14 dias", () => {
  it("dia 3 de teste → manter", () => {
    const rows = buildCampaignDecisions(
      [baseCampaign({ daysRunning: 3, lifetimeConversions: 0 })],
      { storeBer: 2 },
    );
    assert.equal(rows[0]?.status, "maintain");
    assert.match(rows[0]?.reason ?? "", /dia 3 de 7/i);
  });

  it(`${CAMPAIGN_TEST_PHASE_DAYS}+ dias sem conversões → kill`, () => {
    const rows = buildCampaignDecisions(
      [
        baseCampaign({
          daysRunning: CAMPAIGN_TEST_PHASE_DAYS,
          lifetimeConversions: 0,
          conversions: 0,
        }),
      ],
      { storeBer: 2 },
    );
    assert.equal(rows[0]?.status, "kill");
  });

  it(`${CAMPAIGN_TEST_PHASE_DAYS}+ dias com valor de conversão mas contagem 0 → não kill`, () => {
    const rows = buildCampaignDecisions(
      [
        baseCampaign({
          platform: "google",
          platformLabel: "Google",
          daysRunning: CAMPAIGN_TEST_PHASE_DAYS,
          lifetimeConversions: 0,
          lifetimeConversionValue: 120,
          conversions: 0,
          conversionValue: 0,
          lifetimeRoas: 1.2,
          spend: 100,
        }),
      ],
      { storeBer: 2 },
    );
    assert.notEqual(rows[0]?.status, "kill");
  });

  it("ROAS mau entre dia 7 e 13 → manter (segunda janela)", () => {
    const rows = buildCampaignDecisions(
      [
        baseCampaign({
          daysRunning: 10,
          lifetimeConversions: 5,
          lifetimeRoas: 0.5,
          conversionValue: 50,
        }),
      ],
      { storeBer: 2 },
    );
    assert.equal(rows[0]?.status, "maintain");
    assert.match(rows[0]?.reason ?? "", /segunda janela/i);
  });

  it(`${CAMPAIGN_EXTENDED_TEST_DAYS}+ dias com ROAS abaixo do BER → kill`, () => {
    const rows = buildCampaignDecisions(
      [
        baseCampaign({
          daysRunning: CAMPAIGN_EXTENDED_TEST_DAYS,
          lifetimeConversions: 8,
          lifetimeRoas: 0.6,
          spend: 200,
          conversionValue: 120,
        }),
      ],
      { storeBer: 2 },
    );
    assert.equal(rows[0]?.status, "kill");
  });

  it("campanha activa nova sem gasto no período aparece na lista", () => {
    const rows = buildCampaignDecisions(
      [
        baseCampaign({
          spend: 0,
          clicks: 0,
          impressions: 0,
          daysRunning: 2,
          lifetimeConversions: 0,
          isActiveCampaign: true,
        }),
      ],
      { storeBer: 2 },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "maintain");
  });

  it("ROAS acima do BER após teste → scale com peso suficiente", () => {
    const rows = buildCampaignDecisions(
      [
        baseCampaign({
          daysRunning: 20,
          lifetimeConversions: 10,
          lifetimeRoas: 3,
          spend: 500,
          conversionValue: 1500,
          clicks: 100,
        }),
        baseCampaign({
          campaignId: "c2",
          campaignName: "Outra",
          spend: 10,
          clicks: 1,
        }),
      ],
      { storeBer: 2 },
    );
    const main = rows.find((r) => r.campaignId === "c1");
    assert.equal(main?.status, "scale");
  });
});
