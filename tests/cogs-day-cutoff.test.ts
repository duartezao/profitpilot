import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectiveCogsModeForDateKey } from "../src/lib/cogs-modes.ts";

describe("effectiveCogsModeForDateKey", () => {
  it("antes do corte = automático; a partir do corte = day", () => {
    assert.equal(
      effectiveCogsModeForDateKey("day", "2026-07-15", "2026-07-16", "shopify"),
      "shopify",
    );
    assert.equal(
      effectiveCogsModeForDateKey("day", "2026-07-16", "2026-07-16", "shopify"),
      "day",
    );
    assert.equal(
      effectiveCogsModeForDateKey("day", "2026-07-17", "2026-07-16", "shopify"),
      "day",
    );
  });

  it("sem corte mantém o modo da loja", () => {
    assert.equal(effectiveCogsModeForDateKey("day", "2026-07-16", null), "day");
    assert.equal(
      effectiveCogsModeForDateKey("shopify", "2026-07-16", null),
      "shopify",
    );
  });
});
