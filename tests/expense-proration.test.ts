import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expenseAmountForDay,
  expenseAmountForPeriod,
} from "../src/lib/expense-proration.ts";

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

  it("mensal cobra uma vez no dia de início do mês", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 21,
        frequency: "monthly",
        startDateKey: "2026-07-06",
      },
      new Date(2026, 6, 1),
      new Date(2026, 6, 31),
    );
    assert.equal(amount, 21);
  });

  it("mensal não espalha pelos outros dias do mês", () => {
    const onBilling = expenseAmountForDay(
      {
        amountBase: 21,
        frequency: "monthly",
        startDateKey: "2026-07-06",
      },
      "2026-07-06",
    );
    const otherDay = expenseAmountForDay(
      {
        amountBase: 21,
        frequency: "monthly",
        startDateKey: "2026-07-06",
      },
      "2026-07-07",
    );
    assert.equal(onBilling, 21);
    assert.equal(otherDay, 0);
  });

  it("respeita data de fim na mensal", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 30,
        frequency: "monthly",
        startDateKey: "2026-03-15",
        endDateKey: "2026-03-10",
      },
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
    );
    assert.equal(amount, 0);
  });

  it("anual cobra na data de aniversário", () => {
    const amount = expenseAmountForPeriod(
      {
        amountBase: 120,
        frequency: "yearly",
        startDateKey: "2025-03-10",
      },
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
    );
    assert.equal(amount, 120);
  });
});
