import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSessionCountries,
  requiresManualDayCogs,
  sessionCountryKeysFromStore,
  mirrorSessionCountry,
  sessionCountriesLabel,
} from "../src/lib/shopify-countries.ts";
import { cogsModeForSessionCountries } from "../src/lib/cogs-modes.ts";

describe("normalizeSessionCountries", () => {
  it("deduplica e normaliza ISO", () => {
    assert.deepEqual(normalizeSessionCountries(["be", "FR", "BE"]), [
      "BE",
      "FR",
    ]);
  });

  it("lista vazia = mundo", () => {
    assert.deepEqual(normalizeSessionCountries([]), []);
    assert.deepEqual(normalizeSessionCountries(null), []);
  });
});

describe("sessionCountryKeysFromStore", () => {
  it("preferir array; fallback escalar legado", () => {
    assert.deepEqual(
      sessionCountryKeysFromStore({
        analyticsSessionCountries: ["NL", "BE"],
        analyticsSessionCountry: "FR",
      }),
      ["NL", "BE"],
    );
    assert.deepEqual(
      sessionCountryKeysFromStore({
        analyticsSessionCountries: [],
        analyticsSessionCountry: "BE",
      }),
      ["BE"],
    );
  });
});

describe("requiresManualDayCogs / cogsModeForSessionCountries", () => {
  it("só força day com order noutro país (forceDay)", () => {
    assert.equal(requiresManualDayCogs(["BE", "FR"], false), false);
    assert.equal(requiresManualDayCogs(["BE", "FR"], true), true);
    assert.equal(requiresManualDayCogs(["BE"], true), false);
    assert.equal(
      cogsModeForSessionCountries(["BE", "FR"], "shopify", { forceDay: false }),
      "shopify",
    );
    assert.equal(
      cogsModeForSessionCountries(["BE", "FR"], "shopify", { forceDay: true }),
      "day",
    );
    assert.equal(cogsModeForSessionCountries(["BE"], "shopify"), "shopify");
  });
});

describe("mirrorSessionCountry", () => {
  it("1.º país ou null", () => {
    assert.equal(mirrorSessionCountry(["BE", "FR"]), "BE");
    assert.equal(mirrorSessionCountry([]), null);
  });
});

describe("sessionCountriesLabel", () => {
  it("junta labels", () => {
    const label = sessionCountriesLabel(["BE", "FR"]);
    assert.match(label, /Bélgica|Belgium/i);
    assert.ok(label.includes(","));
  });
});
