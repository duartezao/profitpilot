import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLineUnitCost,
  applyLineUnitPrice,
  rebuildLineUnitPricesFromShopify,
} from "../src/lib/line-snapshots.ts";

describe("applyLineUnitPrice", () => {
  it("mantém snapshot quando já existe preço na linha", () => {
    assert.equal(applyLineUnitPrice(29.99, 35), 29.99);
  });

  it("usa preço da API em linha nova", () => {
    assert.equal(applyLineUnitPrice(0, 35), 35);
  });

  it("devolve 0 quando API e snapshot estão vazios", () => {
    assert.equal(applyLineUnitPrice(0, 0), 0);
  });
});

describe("applyLineUnitCost", () => {
  it("mantém snapshot quando já existe custo na linha", () => {
    const resolve = () => 99;
    assert.equal(applyLineUnitCost("v1", new Date(), 12, resolve), 12);
  });

  it("resolve custo pela data quando linha ainda não tem snapshot", () => {
    const resolve = () => 8.5;
    assert.equal(
      applyLineUnitCost("v1", new Date("2024-01-01"), 0, resolve),
      8.5,
    );
  });
});

describe("rebuildLineUnitPricesFromShopify", () => {
  it("atualiza linhas cujo preço difere do original da Shopify", () => {
    const { lines, linesChanged } = rebuildLineUnitPricesFromShopify(
      [
        { unitPrice: 35, title: "A" },
        { unitPrice: 20, title: "B" },
      ],
      [29.99, 20],
    );
    assert.equal(linesChanged, 1);
    assert.equal(lines[0].unitPrice, 29.99);
    assert.equal(lines[1].unitPrice, 20);
  });

  it("ignora linhas sem preço correspondente na Shopify", () => {
    const { lines, linesChanged } = rebuildLineUnitPricesFromShopify(
      [{ unitPrice: 10 }, { unitPrice: 15 }],
      [12],
    );
    assert.equal(linesChanged, 1);
    assert.equal(lines[0].unitPrice, 12);
    assert.equal(lines[1].unitPrice, 15);
  });
});
