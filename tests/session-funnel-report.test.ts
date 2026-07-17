import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Espelho da lógica de pushFunnelReportLines (sem server-only). */
function formatFunnelLines(financials: {
  atcPct: number | null;
  checkoutPct: number | null;
  cvrPct: number | null;
  funnelByCountry?: Array<{
    code: string;
    atcPct: number | null;
    checkoutPct: number | null;
    cvrPct: number | null;
  }>;
}): string[] {
  const lines: string[] = [];
  const byCountry = financials.funnelByCountry;
  if (byCountry && byCountry.length > 1) {
    for (const c of byCountry) {
      if (c.atcPct != null) lines.push(`ATC % ${c.code}: ${c.atcPct.toFixed(2)}%`);
      if (c.checkoutPct != null)
        lines.push(`REACHED CHECKOUT % ${c.code}: ${c.checkoutPct.toFixed(2)}%`);
      if (c.cvrPct != null) lines.push(`CVR % ${c.code}: ${c.cvrPct.toFixed(2)}%`);
    }
    return lines;
  }
  if (financials.atcPct != null) lines.push(`ATC %: ${financials.atcPct.toFixed(2)}%`);
  if (financials.checkoutPct != null)
    lines.push(`REACHED CHECKOUT %: ${financials.checkoutPct.toFixed(2)}%`);
  if (financials.cvrPct != null) lines.push(`CVR %: ${financials.cvrPct.toFixed(2)}%`);
  return lines;
}

describe("report funnel por país", () => {
  it("1 país — linhas agregadas", () => {
    const lines = formatFunnelLines({
      atcPct: 10.16,
      checkoutPct: 8,
      cvrPct: 5.08,
    });
    assert.deepEqual(lines, [
      "ATC %: 10.16%",
      "REACHED CHECKOUT %: 8.00%",
      "CVR %: 5.08%",
    ]);
  });

  it("2+ países — separação por código", () => {
    const lines = formatFunnelLines({
      atcPct: 9,
      checkoutPct: 7,
      cvrPct: 4,
      funnelByCountry: [
        { code: "BE", atcPct: 10.16, checkoutPct: 8, cvrPct: 5.08 },
        { code: "FR", atcPct: 8, checkoutPct: 6, cvrPct: 3 },
      ],
    });
    assert.ok(lines.some((l) => l.startsWith("ATC % BE:")));
    assert.ok(lines.some((l) => l.startsWith("CVR % FR:")));
    assert.ok(!lines.some((l) => l === "ATC %: 9.00%"));
  });
});
