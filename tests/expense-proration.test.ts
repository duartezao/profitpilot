import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseAmountForPeriod } from "../src/lib/expense-proration.ts";

describe("expenseAmountForPeriod", () => {
  it("conta despesa pontual só no dia de início", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 50,
        frequency: "one-time",
        startDateKey: "2026-03-10",
      },
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
    );
    assert.equal(amount, 50);
  });

  it("não conta pontual fora do período", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 50,
        frequency: "one-time",
        startDateKey: "2026-02-01",
      },
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
    );
    assert.equal(amount, 0);
  });

  it("rateia mensal por dias do mês", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 30,
        frequency: "monthly",
        startDateKey: "2026-03-01",
      },
      new Date(2026, 2, 1),
      new Date(2026, 2, 15),
    );
    assert.ok(amount > 14 && amount < 16);
  });

  it("respeita data de fim", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 30,
        frequency: "monthly",
        startDateKey: "2026-03-01",
        endDateKey: "2026-03-10",
      },
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
    );
    assert.ok(amount > 9 && amount < 11);
  });
});
