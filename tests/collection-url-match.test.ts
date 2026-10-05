import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCollectionHandleFromUrl,
  extractCollectionHandlesFromUrls,
  extractPageHandleFromUrl,
  extractPageHandlesFromUrls,
  extractProductHandleFromUrl,
  extractProductHandlesFromUrls,
  normalizeLandingUrls,
  normalizeShopifyHandle,
} from "@/lib/collection-url-match";

describe("collection-url-match", () => {
  it("extrai handle de coleção", () => {
    assert.equal(
      extractCollectionHandleFromUrl(
        "https://marie.example/collections/essenziali?utm_source=google",
      ),
      "essenziali",
    );
  });

  it("extrai handle de produto", () => {
    assert.equal(
      extractProductHandleFromUrl(
        "https://loja.com/products/robe-dete-confortable?utm=1",
      ),
      "robe-dete-confortable",
    );
  });

  it("aceita prefixo de idioma e trailing slash", () => {
    assert.equal(
      extractCollectionHandleFromUrl(
        "https://loja.com/en/collections/essenziali/",
      ),
      "essenziali",
    );
    assert.equal(
      extractProductHandleFromUrl(
        "https://loja.com/fr-be/products/robe-dete/",
      ),
      "robe-dete",
    );
    assert.equal(
      extractCollectionHandleFromUrl(
        "https://loja.com/pt-PT/collections/NOVA-colecao",
      ),
      "nova-colecao",
    );
  });

  it("extrai handle de advertorial /pages/", () => {
    assert.equal(
      extractPageHandleFromUrl(
        "https://sartoriabarberini.com/pages/mary-jane-soletta-ortopedica?utm=1",
      ),
      "mary-jane-soletta-ortopedica",
    );
    assert.equal(
      extractPageHandleFromUrl(
        "https://loja.com/it/pages/Mary-Jane-Soletta/",
      ),
      "mary-jane-soletta",
    );
  });

  it("coleção, produto e page não se confundem", () => {
    assert.equal(
      extractCollectionHandleFromUrl("https://loja.com/products/robe"),
      null,
    );
    assert.equal(
      extractProductHandleFromUrl("https://loja.com/collections/essenziali"),
      null,
    );
    assert.equal(
      extractPageHandleFromUrl("https://loja.com/collections/essenziali"),
      null,
    );
    assert.equal(
      extractProductHandleFromUrl("https://loja.com/pages/advertorial"),
      null,
    );
  });

  it("deduplica handles e URLs", () => {
    assert.deepEqual(
      extractCollectionHandlesFromUrls([
        "https://a.com/collections/foo",
        "https://a.com/collections/FOO?x=1",
        "https://a.com/en/collections/foo/",
      ]),
      ["foo"],
    );
    assert.deepEqual(
      extractProductHandlesFromUrls([
        "https://a.com/products/bar",
        "/products/BAR",
      ]),
      ["bar"],
    );
    assert.deepEqual(
      extractPageHandlesFromUrls([
        "https://a.com/pages/adv",
        "https://a.com/pages/ADV?x=1",
      ]),
      ["adv"],
    );
    assert.deepEqual(
      normalizeLandingUrls([
        "https://a.com/x?utm=1",
        "https://a.com/X/",
        "  ",
        null,
      ]),
      ["https://a.com/x"],
    );
  });

  it("normalizeShopifyHandle remove slash e lowercase", () => {
    assert.equal(normalizeShopifyHandle("Foo/"), "foo");
  });
});
