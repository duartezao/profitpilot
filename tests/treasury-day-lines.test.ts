import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeIncomingDayLines } from "../src/lib/treasury-day-lines.ts";

describe("mergeIncomingDayLines", () => {
  it("funde received e external_gateway no mesmo dia", () => {
    const merged = mergeIncomingDayLines(
      [
        {
          date: "2026-07-28",
          dateLabel: "28 jul",
          amount: 1000,
          amountFmt: "1000 €",
          kind: "received",
          kindLabel: "Recebido",
        },
        {
          date: "2026-07-28",
          dateLabel: "28 jul",
          amount: 500,
          amountFmt: "500 €",
          kind: "external_gateway",
          kindLabel: "Gateway externo",
        },
      ],
      "EUR",
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.kind, "received");
    assert.equal(merged[0]!.amount, 1500);
  });

  it("mantém payout e pending no mesmo dia como linhas distintas", () => {
    const merged = mergeIncomingDayLines(
      [
        {
          date: "2026-08-30",
          dateLabel: "30 ago",
          amount: 100,
          amountFmt: "100 €",
          kind: "payout",
          kindLabel: "Payout",
        },
        {
          date: "2026-08-30",
          dateLabel: "30 ago",
          amount: 200,
          amountFmt: "200 €",
          kind: "pending",
          kindLabel: "Pendente",
        },
      ],
      "EUR",
    );
    assert.equal(merged.length, 2);
  });
});
