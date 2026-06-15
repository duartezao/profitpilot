import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCsv, csvEscape } from "../src/lib/csv.ts";

describe("csvEscape", () => {
  it("envolve valores com vírgulas", () => {
    assert.equal(csvEscape("a,b"), '"a,b"');
  });

  it("duplica aspas internas", () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  });
});

describe("buildCsv", () => {
  it("gera cabeçalho e linhas com BOM UTF-8", () => {
    const csv = buildCsv(["Nome", "Valor"], [["Produto A", 10]]);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Nome,Valor"));
    assert.ok(csv.includes("Produto A,10"));
  });
});
