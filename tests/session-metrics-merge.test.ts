import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { preferSessionDayCounts } from "../src/lib/session-metrics-merge.ts";

describe("preferSessionDayCounts", () => {
  it("prefere o lado com dados quando o outro é zero", () => {
    const legacy = { sessions: 100, cart: 10, checkout: 8, completed: 5 };
    const isoZero = { sessions: 0, cart: 0, checkout: 0, completed: 0 };
    assert.deepEqual(preferSessionDayCounts(isoZero, legacy), legacy);
    assert.deepEqual(preferSessionDayCounts(legacy, isoZero), legacy);
  });

  it("prefere mais sessões em conflito", () => {
    const a = { sessions: 50, cart: 5, checkout: 4, completed: 2 };
    const b = { sessions: 80, cart: 3, checkout: 2, completed: 1 };
    assert.deepEqual(preferSessionDayCounts(a, b), b);
  });

  it("em empate de sessões usa max por campo de funil", () => {
    const a = { sessions: 100, cart: 12, checkout: 5, completed: 3 };
    const b = { sessions: 100, cart: 10, checkout: 8, completed: 4 };
    assert.deepEqual(preferSessionDayCounts(a, b), {
      sessions: 100,
      cart: 12,
      checkout: 8,
      completed: 4,
    });
  });
});
