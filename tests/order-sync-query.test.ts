import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderSyncSearchQuery } from "../src/lib/order-sync-query.ts";

describe("orderSyncSearchQuery", () => {
  const store = {
    importStartDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    lastSyncAt: new Date("2026-06-01T00:00:00.000Z"),
  };

  it("sync incremental usa updated_at com lookback de 6h", () => {
    const q = orderSyncSearchQuery(store);
    assert.match(q, /^updated_at:>=/);
    assert.doesNotMatch(q, /^created_at:>=/);
    // lastSyncAt 2026-06-01T00:00 → since 2026-05-31T18:00
    assert.match(q, /updated_at:>=2026-05-31T18:00:00/);
  });

  it("resync total usa created_at desde importStartDate", () => {
    const q = orderSyncSearchQuery(store, { fullOrderResync: true });
    assert.match(q, /^created_at:>=2026-01-01/);
    assert.doesNotMatch(q, /^updated_at:>=/);
  });

  it("exclui voided", () => {
    const q = orderSyncSearchQuery(store);
    assert.match(q, /-financial_status:voided$/);
  });
});
