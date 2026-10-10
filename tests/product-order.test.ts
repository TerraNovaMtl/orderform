import { test } from "node:test";
import assert from "node:assert/strict";
import { reorderVisibleProducts } from "../src/lib/product-order";

test("dragging products changes their sequence in both directions", () => {
  assert.deepEqual(
    reorderVisibleProducts(["a", "b", "c"], ["a", "b", "c"], "a", "c"),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    reorderVisibleProducts(["a", "b", "c"], ["a", "b", "c"], "c", "a"),
    ["c", "a", "b"],
  );
});
test("category and search filters preserve hidden product positions", () => {
  assert.deepEqual(
    reorderVisibleProducts(
      ["a", "hidden", "b", "other", "c"],
      ["a", "b", "c"],
      "c",
      "a",
    ),
    ["c", "hidden", "a", "other", "b"],
  );
});
test("invalid and unchanged drops do not reorder products", () => {
  const ids = ["a", "b"];
  assert.equal(reorderVisibleProducts(ids, ids, "a", "a"), ids);
  assert.equal(reorderVisibleProducts(ids, ids, "missing", "a"), ids);
});
