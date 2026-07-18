import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFreshParam } from "../src/lib/request-fresh.ts";
import { isLiveQueryKey } from "../src/lib/live-query-keys.ts";

describe("parseFreshParam", () => {
  it("aceita 1 e true", () => {
    assert.equal(parseFreshParam(new URLSearchParams("fresh=1")), true);
    assert.equal(parseFreshParam(new URLSearchParams("fresh=true")), true);
  });

  it("rejeita ausente ou outros", () => {
    assert.equal(parseFreshParam(new URLSearchParams("")), false);
    assert.equal(parseFreshParam(new URLSearchParams("fresh=0")), false);
  });
});

describe("isLiveQueryKey", () => {
  it("reconhece prefixes live", () => {
    assert.equal(isLiveQueryKey(["metrics-summary", "ws"]), true);
    assert.equal(isLiveQueryKey(["treasury"]), true);
    assert.equal(isLiveQueryKey(["other"]), false);
  });
});
