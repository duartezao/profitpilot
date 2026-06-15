import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GoogleAdsApiError,
  normalizeCustomerId,
} from "../src/lib/google-ads.ts";

describe("normalizeCustomerId", () => {
  it("remove hífens", () => {
    assert.equal(normalizeCustomerId("123-456-7890"), "1234567890");
  });

  it("mantém dígitos", () => {
    assert.equal(normalizeCustomerId("1234567890"), "1234567890");
  });

  it("rejeita ID curto", () => {
    assert.throws(
      () => normalizeCustomerId("123"),
      GoogleAdsApiError,
    );
  });
});
