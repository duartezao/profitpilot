import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  metricsFromSpendDays,
  classifyPerformanceBucket,
  type CampaignAnalysisWindow,
} from "../src/lib/campaign-analysis-core.ts";

function classifyForTest(
  spendDays: Array<{
    spend: number;
    conversions: number;
    conversionValue: number;
  }>,
  windowDays: CampaignAnalysisWindow,
  ber: number | null,
) {
  const full = spendDays.slice(0, windowDays);
  const m = metricsFromSpendDays(
    full.map((d, i) => ({
      dateKey: `2026-01-${String(i + 1).padStart(2, "0")}`,
      spend: d.spend,
      impressions: 1000,
      clicks: 50,
      conversions: d.conversions,
      conversionValue: d.conversionValue,
      dailyBudget: null,
    })),
  );
  const hasFull = full.length >= windowDays;
  if (m.conversions <= 0 && hasFull) return "no_conversions";
  return classifyPerformanceBucket(m.conversions, m.roas, ber, hasFull);
}

describe("campaign-analysis — janela de dias com gasto", () => {
  it("7 dias com gasto e zero conv. → sem vendas", () => {
    const days = Array.from({ length: 7 }, () => ({
      spend: 10,
      conversions: 0,
      conversionValue: 0,
    }));
    assert.equal(classifyForTest(days, 7, 2), "no_conversions");
  });

  it("menos de 7 dias com gasto — bucket sem vendas mas em teste", () => {
    const days = Array.from({ length: 3 }, () => ({
      spend: 10,
      conversions: 0,
      conversionValue: 0,
    }));
    assert.equal(classifyForTest(days, 7, 2), "no_conversions");
  });

  it("ROAS acima do BER → performing", () => {
    const days = Array.from({ length: 7 }, () => ({
      spend: 10,
      conversions: 2,
      conversionValue: 30,
    }));
    assert.equal(classifyForTest(days, 7, 2), "performing");
  });

  it("ROAS abaixo do BER → marginal", () => {
    const days = Array.from({ length: 7 }, () => ({
      spend: 10,
      conversions: 1,
      conversionValue: 10,
    }));
    assert.equal(classifyForTest(days, 7, 2), "marginal");
  });
});

describe("metricsFromSpendDays", () => {
  it("agrega spend e conversões", () => {
    const m = metricsFromSpendDays([
      {
        dateKey: "2026-01-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
        conversions: 1,
        conversionValue: 20,
        dailyBudget: null,
      },
      {
        dateKey: "2026-01-02",
        spend: 15,
        impressions: 200,
        clicks: 10,
        conversions: 0,
        conversionValue: 0,
        dailyBudget: null,
      },
    ]);
    assert.equal(m.spend, 25);
    assert.equal(m.conversions, 1);
    assert.equal(m.roas, 20 / 25);
  });
});
