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
  const page = result.at(-1)!;
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
