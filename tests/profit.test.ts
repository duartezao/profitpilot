import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcNetProfit,
  contributionMarginPct,
  berRoas,
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
