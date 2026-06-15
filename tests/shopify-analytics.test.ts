import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDailySessionsQuery } from "../src/lib/shopifyql-sessions.ts";

describe("buildDailySessionsQuery", () => {
  it("segue a ordem ShopifyQL: WHERE antes de SINCE, TIMESERIES em vez de GROUP BY antes de SINCE", () => {
    const q = buildDailySessionsQuery("2026-06-01", "2026-06-14", "BE");
    const whereIdx = q.indexOf("WHERE");
    const sinceIdx = q.indexOf("SINCE");
    const timeseriesIdx = q.indexOf("TIMESERIES");

    assert.ok(whereIdx >= 0, "tem WHERE");
    assert.ok(sinceIdx > whereIdx, "SINCE depois de WHERE");
    assert.ok(timeseriesIdx > sinceIdx, "TIMESERIES depois de SINCE");
    assert.ok(!/GROUP BY day.*SINCE/.test(q), "GROUP BY não antes de SINCE");
    assert.match(q, /session_country_code = 'BE'/);
  });

  it("sem país não inclui WHERE", () => {
    const q = buildDailySessionsQuery("2026-06-01", "2026-06-14", null);
    assert.ok(!q.includes("WHERE"));
    assert.match(q, /TIMESERIES day/);
  });
});
