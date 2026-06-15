import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeActId, MetaApiError } from "../src/lib/meta-ads.ts";

describe("normalizeActId", () => {
  it("mantém act_ prefix", () => {
    assert.equal(normalizeActId("act_123"), "act_123");
  });

  it("adiciona act_ a IDs numéricos", () => {
    assert.equal(normalizeActId("123456789"), "act_123456789");
  });

  it("rejeita ID vazio", () => {
    assert.throws(() => normalizeActId(""), MetaApiError);
  });
});
