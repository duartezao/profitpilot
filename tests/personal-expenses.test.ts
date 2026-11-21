import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonalExpenseOverview,
  resolvePersonalMonthRange,
  resolvePersonalWeekRange,
  shiftPersonalMonth,
  sumProfitForRange,
  type PersonalExpenseRow,
} from "../src/lib/personal-expenses-overview.ts";

function row(
  partial: Partial<PersonalExpenseRow> &
    Pick<PersonalExpenseRow, "userId" | "userName" | "dateKey" | "amountBase">,
): PersonalExpenseRow {
  return {
    id: partial.id ?? "1",
    description: partial.description ?? "x",
    amount: partial.amount ?? partial.amountBase,
    amountFmt: "€0",
    amountBaseFmt: "€0",
    currency: "EUR",
    ...partial,
  };
}

describe("resolvePersonalMonthRange / week", () => {
  it("mês civil completo", () => {
    const r = resolvePersonalMonthRange("2026-11");
    assert.equal(r.startKey, "2026-11-01");
    assert.equal(r.endKey, "2026-11-30");
  });

  it("semana seg–dom", () => {
    // 2026-11-18 = quarta
    const r = resolvePersonalWeekRange("2026-11-18");
    assert.equal(r.startKey, "2026-11-16");
    assert.equal(r.endKey, "2026-11-22");
  });

  it("shift mês", () => {
    assert.equal(shiftPersonalMonth("2026-01", -1), "2025-12");
    assert.equal(shiftPersonalMonth("2025-12", 1), "2026-01");
  });
});

describe("buildPersonalExpenseOverview", () => {
  const period = {
    label: "Este mês",
    startKey: "2026-11-01",
    endKey: "2026-11-30",
  };

  it("soma por pessoa, % lucro e comparação", () => {
    const rows = [
      row({
        userId: "a",
        userName: "Ana",
        dateKey: "2026-11-05",
        amountBase: 100,
      }),
      row({
        userId: "a",
        userName: "Ana",
        dateKey: "2026-11-10",
        amountBase: 50,
      }),
      row({
        userId: "b",
        userName: "Bruno",
        dateKey: "2026-11-12",
        amountBase: 250,
      }),
      row({
        userId: "b",
        userName: "Bruno",
        dateKey: "2026-10-31",
        amountBase: 999,
      }),
    ];
    const overview = buildPersonalExpenseOverview(
      rows,
      period,
      1000,
      "EUR",
      [
        { userId: "a", userName: "Ana" },
        { userId: "b", userName: "Bruno" },
      ],
    );
    assert.equal(overview.totalBase, 400);
    assert.equal(overview.pctOfProfit, 40);
    assert.equal(overview.byPerson.length, 2);
    assert.equal(overview.byPerson[0]!.userName, "Bruno");
    assert.equal(overview.byPerson[0]!.totalBase, 250);
    assert.equal(overview.byPerson[0]!.shareOfPersonal, 62.5);
    assert.equal(overview.byPerson[0]!.barPct, 100);
    assert.equal(overview.averagePerPerson, 200);
  });

  it("% null quando lucro ≤ 0", () => {
    const rows = [
      row({
        userId: "a",
        userName: "Ana",
        dateKey: "2026-11-05",
        amountBase: 100,
      }),
    ];
    const overview = buildPersonalExpenseOverview(rows, period, 0, "EUR");
    assert.equal(overview.pctOfProfit, null);
    assert.equal(overview.pctOfProfitFmt, "—");
  });
});

describe("sumProfitForRange", () => {
  it("soma dias do intervalo", () => {
    const profit = {
      "2026-11-01": 10,
      "2026-11-02": 20,
      "2026-11-15": 5,
    };
    assert.equal(
      sumProfitForRange(profit, {
        label: "x",
        startKey: "2026-11-01",
        endKey: "2026-11-02",
      }),
      30,
    );
  });
});
