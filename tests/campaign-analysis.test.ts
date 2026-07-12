import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  metricsFromSpendDays,
  classifyPerformanceBucket,
  roasChangeVerdict,
  buildNoConversionsPauseCopyMessage,
  buildMediaBuyerPauseCopyMessage,
  classifyDecisionViewSection,
  isRoasClearlyBelowBer,
  buildContiguousSpendWindow,
  PAUSE_ROAS_BELOW_BER_RATIO,
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
  referenceDateKey?: string,
) {
  const rows = spendDays.map((d, i) => ({
    dateKey: `2026-01-${String(i + 1).padStart(2, "0")}`,
    spend: d.spend,
    impressions: 1000,
    clicks: 50,
    conversions: d.conversions,
    conversionValue: d.conversionValue,
    dailyBudget: null,
  }));
  const ref =
    referenceDateKey ??
    rows[rows.length - 1]?.dateKey ??
    "2026-01-01";
  const spendWindow = buildContiguousSpendWindow(rows, windowDays, ref);
  const m = metricsFromSpendDays(spendWindow.windowDays);
  const hasFull = spendWindow.hasFullWindow;
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

describe("roasChangeVerdict — comparação pós-acção", () => {
  it("menos de 3 dias → early", () => {
    assert.equal(roasChangeVerdict(2, 2.5, 2), "early");
  });

  it("ROAS sobe >5% → better", () => {
    assert.equal(roasChangeVerdict(2, 2.2, 3), "better");
  });

  it("ROAS desce >5% → worse", () => {
    assert.equal(roasChangeVerdict(2, 1.8, 4), "worse");
  });

  it("variação dentro de ±5% → same", () => {
    assert.equal(roasChangeVerdict(2, 2.04, 3), "same");
  });
});

describe("buildNoConversionsPauseCopyMessage", () => {
  it("uma campanha — frase simples em inglês", () => {
    const msg = buildNoConversionsPauseCopyMessage(
      [
        {
          name: "04-07 - Mocassins #3",
          adAccountName: "DUARTE LEAL | Marie Bruxelles",
          hasFullWindow: true,
          conversions: 0,
          spendDaysRequired: 7,
        },
      ],
      7,
    );
    assert.ok(msg?.includes("didn't convert any sales"));
    assert.ok(msg?.includes("04-07 - Mocassins #3"));
  });

  it("várias campanhas na mesma conta", () => {
    const msg = buildNoConversionsPauseCopyMessage(
      [
        {
          name: "Camp A",
          adAccountName: "Store Meta",
          hasFullWindow: true,
          conversions: 0,
          spendDaysRequired: 5,
        },
        {
          name: "Camp B",
          adAccountName: "Store Meta",
          hasFullWindow: true,
          conversions: 0,
          spendDaysRequired: 5,
        },
      ],
      5,
    );
    assert.ok(msg?.includes('Campaigns "Camp A", "Camp B"'));
    assert.ok(msg?.includes("last 5 days"));
  });

  it("ignora campanhas em teste ou com vendas", () => {
    assert.equal(
      buildNoConversionsPauseCopyMessage([
        {
          name: "New Camp",
          adAccountName: "Store",
          hasFullWindow: false,
          conversions: 0,
          spendDaysRequired: 7,
        },
      ]),
      null,
    );
    assert.equal(
      buildNoConversionsPauseCopyMessage([
        {
          name: "Has Sale",
          adAccountName: "Store",
          hasFullWindow: true,
          conversions: 1,
          spendDaysRequired: 7,
        },
      ]),
      null,
    );
  });
});

describe("buildMediaBuyerPauseCopyMessage", () => {
  it("inclui sem vendas e abaixo do BER sem ROAS na mensagem", () => {
    const msg = buildMediaBuyerPauseCopyMessage(
      [
        {
          name: "Mocassins",
          adAccountName: "Marie",
          hasFullWindow: true,
          conversions: 0,
          roasValue: null,
          berRoas: 1.58,
          pauseCause: "no_sales",
        },
        {
          name: "Salopettes",
          adAccountName: "Marie",
          hasFullWindow: true,
          conversions: 2,
          roasValue: 0.34,
          berRoas: 1.58,
          pauseCause: "below_ber",
        },
      ],
      7,
    );
    assert.ok(msg?.includes("didn't convert any sales"));
    assert.ok(msg?.includes("below break-even"));
    assert.ok(msg?.includes('"Salopettes"'));
    assert.ok(!msg?.includes("1.43x"));
    assert.ok(!msg?.includes("vs"));
  });
});

describe("isRoasClearlyBelowBer", () => {
  it("ROAS ligeiramente abaixo do BER → não é pausa clara", () => {
    assert.equal(isRoasClearlyBelowBer(1.44, 1.58), false);
    assert.equal(isRoasClearlyBelowBer(1.54, 1.58), false);
  });

  it("ROAS bem abaixo do BER → pausa clara", () => {
    assert.equal(isRoasClearlyBelowBer(0.34, 1.58), true);
    assert.equal(isRoasClearlyBelowBer(1.58 * PAUSE_ROAS_BELOW_BER_RATIO - 0.01, 1.58), true);
  });
});

describe("classifyDecisionViewSection", () => {
  it("ROAS bem abaixo do BER → pause", () => {
    assert.equal(
      classifyDecisionViewSection({
        hasFullWindow: true,
        conversions: 4,
        roasValue: 0.9,
        berRoas: 1.58,
        bucket: "marginal",
      }),
      "pause",
    );
  });

  it("ROAS ligeiramente abaixo do BER → watch", () => {
    assert.equal(
      classifyDecisionViewSection({
        hasFullWindow: true,
        conversions: 4,
        roasValue: 1.44,
        berRoas: 1.58,
        bucket: "marginal",
      }),
      "watch",
    );
  });

  it("janela incompleta → testing", () => {
    assert.equal(
      classifyDecisionViewSection({
        hasFullWindow: false,
        conversions: 0,
        roasValue: null,
        berRoas: 1.58,
        bucket: "no_conversions",
      }),
      "testing",
    );
  });
});

describe("buildContiguousSpendWindow", () => {
  const day = (
    dateKey: string,
    spend = 10,
  ): {
    dateKey: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValue: number;
    dailyBudget: null;
  } => ({
    dateKey,
    spend,
    impressions: 100,
    clicks: 5,
    conversions: 0,
    conversionValue: 0,
    dailyBudget: null,
  });

  it("dias com gasto 0 são excluídos — lacuna no calendário corta a série", () => {
    const result = buildContiguousSpendWindow(
      [day("2026-07-10"), { ...day("2026-07-09"), spend: 0 }, day("2026-07-08")],
      5,
      "2026-07-10",
    );
    assert.equal(result.spendDayCount, 1);
    assert.equal(result.streakLength, 1);
    assert.equal(result.hasFullWindow, false);
    assert.equal(result.staleSpend, false);
  });

  it("lacuna no calendário corta a série — só conta dias consecutivos recentes", () => {
    const result = buildContiguousSpendWindow(
      [
        day("2026-07-10"),
        day("2026-07-09"),
        day("2026-07-08"),
        day("2026-07-06"),
        day("2026-07-05"),
      ],
      5,
      "2026-07-10",
    );
    assert.equal(result.streakLength, 3);
    assert.equal(result.hasFullWindow, false);
    assert.equal(result.spendDayCount, 3);
  });

  it("7 dias consecutivos com gasto → janela completa", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      day(`2026-07-${String(4 + i).padStart(2, "0")}`),
    );
    const result = buildContiguousSpendWindow(days, 7, "2026-07-10");
    assert.equal(result.hasFullWindow, true);
    assert.equal(result.spendDayCount, 7);
    assert.equal(result.staleSpend, false);
  });

  it("sem gasto recente → ciclo interrompido (staleSpend)", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      day(`2026-07-${String(1 + i).padStart(2, "0")}`),
    );
    const result = buildContiguousSpendWindow(days, 7, "2026-07-10");
    assert.equal(result.staleSpend, true);
    assert.equal(result.hasFullWindow, false);
    assert.equal(result.spendDayCount, 0);
    assert.equal(result.lastSpendDateKey, "2026-07-07");
  });

  it("último gasto ontem → ciclo activo", () => {
    const result = buildContiguousSpendWindow(
      [day("2026-07-09"), day("2026-07-08")],
      5,
      "2026-07-10",
    );
    assert.equal(result.staleSpend, false);
    assert.equal(result.streakLength, 2);
  });
});
