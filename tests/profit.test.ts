import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcNetProfit,
  contributionMarginPct,
  berRoas,
  calcPoas,
  fmtPoas,
  fmtBerRoas,
  formatProfitBreakdown,
} from "../src/lib/profit.ts";

describe("calcNetProfit", () => {
  it("subtrai COGS, envio, taxas e ad spend da revenue líquida", () => {
    const profit = calcNetProfit(
      { revenue: 1000, cogs: 300, shipping: 50, fees: 30 },
      120,
    );
    assert.equal(profit, 500);
  });

  it("não subtrai refunds — já estão na revenue líquida", () => {
    const profit = calcNetProfit(
      { revenue: 800, cogs: 200, shipping: 0, fees: 0 },
      0,
    );
    assert.equal(profit, 600);
  });

  it("lucro negativo quando custos excedem revenue", () => {
    const profit = calcNetProfit(
      { revenue: 100, cogs: 80, shipping: 30, fees: 10 },
      50,
    );
    assert.equal(profit, -70);
  });

  it("subtrai despesas operacionais (apps/fixos)", () => {
    const profit = calcNetProfit(
      { revenue: 500, cogs: 200, shipping: 0, fees: 0 },
      100,
      50,
    );
    assert.equal(profit, 150);
  });
});

describe("contributionMarginPct", () => {
  it("devolve 0 quando revenue é zero", () => {
    assert.equal(
      contributionMarginPct({ revenue: 0, cogs: 10, shipping: 0, fees: 0 }),
      0,
    );
  });

  it("calcula margem de contribuição antes do ad spend", () => {
    const pct = contributionMarginPct({
      revenue: 200,
      cogs: 80,
      shipping: 20,
      fees: 0,
    });
    assert.equal(pct, 50);
  });
});

describe("berRoas", () => {
  it("devolve null quando margem de contribuição não é positiva", () => {
    assert.equal(
      berRoas({ revenue: 100, cogs: 90, shipping: 20, fees: 0 }),
      null,
    );
  });

  it("calcula revenue / contribution margin", () => {
    const roas = berRoas({
      revenue: 300,
      cogs: 100,
      shipping: 50,
      fees: 0,
    });
    assert.equal(roas, 2);
  });
});

describe("calcPoas", () => {
  it("devolve null quando ad spend é zero", () => {
    assert.equal(calcPoas(500, 0), null);
  });

  it("calcula lucro líquido / ad spend", () => {
    assert.equal(calcPoas(500, 250), 2);
  });

  it("aceita lucro negativo", () => {
    assert.equal(calcPoas(-100, 200), -0.5);
  });
});

describe("formatProfitBreakdown", () => {
  it("explica dias só com ads", () => {
    const text = formatProfitBreakdown(
      { revenue: 0, cogs: 0, fees: 0 },
      48.86,
      (v) => `${v.toFixed(2)}€`,
    );
    assert.match(text, /sem vendas neste dia/);
    assert.match(text, /48\.86/);
  });

  it("indica quando ad spend ainda não foi registado", () => {
    const text = formatProfitBreakdown(
      { revenue: 100, cogs: 40, fees: 0 },
      0,
      (v) => `${v.toFixed(2)}€`,
      { adSpendKnown: false },
    );
    assert.match(text, /ad spend por preencher/);
    assert.doesNotMatch(text, /ads −/);
    assert.match(text, /60\.00€/);
  });
});

describe("fmtBerRoas", () => {
  it("formata com vírgula decimal", () => {
    assert.equal(fmtBerRoas(2.5), "2,50");
  });

  it("devolve traço quando null", () => {
    assert.equal(fmtBerRoas(null), "—");
  });
});

describe("fmtPoas", () => {
  it("formata com vírgula decimal", () => {
    assert.equal(fmtPoas(1.5), "1,50");
  });

  it("devolve traço quando null", () => {
    assert.equal(fmtPoas(null), "—");
  });
});
