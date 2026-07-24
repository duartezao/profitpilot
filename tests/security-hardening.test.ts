import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessStore,
  normalizeStoreAccess,
} from "../src/lib/store-access.ts";
import { validatePasswordStrength } from "../src/lib/password-policy.ts";
import { timingSafeStringEqual } from "../src/lib/timing-safe.ts";

describe("store-access fail-closed", () => {
  it("valores inválidos não abrem all", () => {
    assert.deepEqual(normalizeStoreAccess(null), []);
    assert.deepEqual(normalizeStoreAccess(undefined), []);
    assert.deepEqual(normalizeStoreAccess("oops"), []);
    assert.deepEqual(normalizeStoreAccess(42), []);
  });

  it("all e arrays válidos", () => {
    assert.equal(normalizeStoreAccess("all"), "all");
    const id = "507f1f77bcf86cd799439011";
    assert.deepEqual(normalizeStoreAccess([id]), [id]);
    assert.equal(canAccessStore("all", id), true);
    assert.equal(canAccessStore([id], id), true);
    assert.equal(canAccessStore([id], "507f1f77bcf86cd799439012"), false);
    assert.equal(canAccessStore("all", "not-an-id"), false);
  });
});

describe("password-policy", () => {
  it("rejeita passwords fracas", () => {
    assert.ok(validatePasswordStrength("123"));
    assert.ok(validatePasswordStrength("onlyletters"));
    assert.ok(validatePasswordStrength("12345678"));
    assert.equal(validatePasswordStrength("Segura1a"), null);
  });
});

describe("timing-safe", () => {
  it("compara strings", () => {
    assert.equal(timingSafeStringEqual("abc", "abc"), true);
    assert.equal(timingSafeStringEqual("abc", "abd"), false);
  });
});
