import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeOrderFees,
  ensureFeeSchedule,
  resolveFeeConfigForDateKey,
  shouldPreserveStoredOrderFees,
} from "../src/lib/fee-schedule.ts";

describe("fee schedule", () => {
  const floor = "2026-01-01";
  const schedule = [
    {
      effectiveFromKey: "2026-01-01",
      processingPercent: 1.5,
      processingFixed: 0.3,
      transactionFeePercent: 0,
    },
    {
      effectiveFromKey: "2026-06-15",
      processingPercent: 2,
      processingFixed: 0.3,
      transactionFeePercent: 0,
    },
  ];

  it("resolve taxa por dia", () => {
    const before = resolveFeeConfigForDateKey(schedule, null, "2026-06-14", floor);
    assert.equal(before.processingPercent, 1.5);
    const after = resolveFeeConfigForDateKey(schedule, null, "2026-06-15", floor);
    assert.equal(after.processingPercent, 2);
  });

  it("preserva fees antigas após nova entrada no calendário", () => {
    assert.equal(
      shouldPreserveStoredOrderFees(3.42, "2026-06-14", schedule),
      true,
    );
    assert.equal(
      shouldPreserveStoredOrderFees(3.42, "2026-06-15", schedule),
      false,
    );
  });

  it("calcula fees a partir da taxa do dia", () => {
    const cfg = resolveFeeConfigForDateKey(schedule, null, "2026-06-15", floor);
    const fees = computeOrderFees(100, cfg);
    assert.equal(fees, 2.3);
  });

  it("cria entrada inicial a partir de feeConfig legado", () => {
    const s = ensureFeeSchedule([], { processingPercent: 1.5 }, floor);
    assert.equal(s.length, 1);
    assert.equal(s[0]!.effectiveFromKey, floor);
    assert.equal(s[0]!.processingPercent, 1.5);
  });
});
