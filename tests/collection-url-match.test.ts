import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCollectionHandleFromUrl,
  extractCollectionHandlesFromUrls,
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

  it("coleção e produto não se confundem", () => {
    assert.equal(
      extractCollectionHandleFromUrl("https://loja.com/products/robe"),
      null,
    );
    assert.equal(
      extractProductHandleFromUrl("https://loja.com/collections/essenziali"),
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
