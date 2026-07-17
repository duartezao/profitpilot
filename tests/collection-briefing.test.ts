import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCollectionBriefingMessage,
  joinStoreBriefingMessages,
  normalizeCampaignBaseName,
  uniqueCampaignBaseNames,
} from "@/lib/collection-briefing";

describe("collection-briefing", () => {
  it("normaliza nomes com data e #", () => {
    assert.equal(
      normalizeCampaignBaseName("04-07 - Mocassins #3"),
      "Mocassins",
    );
    assert.equal(normalizeCampaignBaseName("robes-d-ete #2"), "robes-d-ete");
    assert.equal(
      normalizeCampaignBaseName("04/07 - Robes d'été"),
      "Robes d'été",
    );
  });

  it("deduplica bases", () => {
    assert.deepEqual(
      uniqueCampaignBaseNames([
        "Mocassins #1",
        "Mocassins #2",
        "Mocassins #3",
      ]),
      ["Mocassins"],
    );
  });

  it("monta mensagem EN", () => {
    const text = buildCollectionBriefingMessage({
      periodFromLabel: "11 Jul 2026",
      periodToLabel: "17 Jul 2026",
      adAccount: "Marie Google",
      storeDomain: "marie-bruxelles.com",
      campaignNames: ["04-07 - Mocassins #3", "04-07 - Mocassins #4"],
      revenueFmt: "1.034,49 €",
      spendFmt: "586,54 €",
      roasFmt: "1,76×",
      collectionTitle: "mocassins",
    });
    assert.match(text, /Day 11 Jul 2026 to 17 Jul 2026/);
    assert.match(text, /Ad account: Marie Google/);
    assert.match(text, /Store: marie-bruxelles\.com/);
    assert.match(text, /Campaign: Mocassins\n/);
    assert.match(text, /overall collection ROAS is 1,76×/);
    assert.doesNotMatch(text, /scale, descale or kill/);
  });

  it("junta briefings da loja", () => {
    const joined = joinStoreBriefingMessages(["aaa\nbbb", "ccc\nddd"]);
    assert.equal(joined, "aaa\nbbb\n\n---\n\nccc\nddd");
  });
});
