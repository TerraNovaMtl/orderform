import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogPages, hasUploadedPage } from "../src/lib/catalog-pages";
import { productSchema, type Product } from "../src/lib/domain";

const product: Product = {
  ...productSchema.parse({
    name: "Uploaded product",
    sku: "123",
    barcode: "",
    cost: 1,
    srp: 2,
    orderUnit: "case",
    unitsPerOrder: 24,
    unitLabel: "items",
    category: "Home",
    style: "",
    description: "",
    image: "/api/images/cae0140c-c647-4b1e-9335-0d2133dd37e1",
    status: "available",
    agentCodes: [],
  }),
  id: "cae0140c-c647-4b1e-9335-0d2133dd37e1",
  version: 1,
};

test("uploaded product page maps the entire image and appends after the imported catalogue", () => {
  const existing = catalogPages([]);
  const result = catalogPages([product]);
  const page = result.find((page) =>
    page.regions.some((r) => r.key === product.id),
  )!;
  assert.equal(result.length, existing.length + 1);
  assert.equal(page.number, existing.at(-1)!.number + 1);
  assert.equal(page.image, product.image);
  assert.deepEqual(page.regions, [{ key: product.id, bounds: [0, 0, 1, 1] }]);
});

test("imported products are not duplicated and products without uploads stay in the list", () => {
  assert.equal(hasUploadedPage({ ...product, catalogKey: "row-10" }), false);
  assert.equal(hasUploadedPage({ ...product, image: "" }), false);
  assert.equal(
    catalogPages([{ ...product, catalogKey: "row-10" }]).length,
    catalogPages([]).length,
  );
});

test("catalogue follows product order while keeping cover first and shared pages together", () => {
  const sweater = { ...product, id: "sweater", catalogKey: "row-10" };
  const shorts = { ...product, id: "shorts", catalogKey: "row-11" };
  const twin = { ...product, id: "twin", catalogKey: "row-19" };
  const queen = { ...product, id: "queen", catalogKey: "row-20" };
  const result = catalogPages([shorts, twin, queen, sweater]);
  assert.equal(result[0].number, 1);
  assert.equal(result[1].number, 3);
  assert.equal(result[2].number, 11);
  assert.equal(result[3].number, 2);
  assert.equal(result.filter((page) => page.number === 11).length, 1);
});
