import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesProductSearch } from "../src/lib/product-search";
import type { Product } from "../src/lib/domain";
const socks = {
  name: "Kids 3-Pack Fun Socks",
  sku: "6873145",
  category: "Kids",
  style: "Assorted",
} as Product;
test("socks match both French synonyms and English regardless of display language", () => {
  for (const query of ["bas", "chaussettes", "socks", " BAS ", "6873145"]) {
    assert.ok(matchesProductSearch(socks, query));
    assert.ok(matchesProductSearch(socks, query, () => "Chaussettes"));
  }
  assert.equal(matchesProductSearch(socks, "quilt"), false);
});
test("French search ignores accents and keeps original English names searchable", () => {
  assert.ok(matchesProductSearch(socks, "amusantes"));
  assert.ok(matchesProductSearch(socks, "paquet"));
  assert.ok(
    matchesProductSearch(
      { ...socks, category: "Bedding" },
      "literie",
      (text) => (text === "Bedding" ? "Litérie" : text),
    ),
  );
  assert.equal(
    matchesProductSearch({ ...socks, name: "Basic Shirt" }, "chaussettes"),
    false,
  );
});
