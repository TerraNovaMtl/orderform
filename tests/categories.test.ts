import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { categorySchema } from "../src/lib/domain";
import { db } from "../src/lib/db";
import {
  deleteCategory,
  listCategories,
  saveCategory,
  saveProduct,
  listProducts,
} from "../src/lib/repository";

test("categories require both languages and trim names", () => {
  assert.deepEqual(
    categorySchema.parse({ nameEn: " Home ", nameFr: " Maison " }),
    { nameEn: "Home", nameFr: "Maison" },
  );
  assert.equal(
    categorySchema.safeParse({ nameEn: "Home", nameFr: " " }).success,
    false,
  );
});

test(
  "category renames update products, reject stale edits and preserve French labels",
  { skip: !process.env.RUN_CATEGORY_DB_TESTS },
  async () => {
    const name = `CATEGORY-${randomUUID()}`;
    const actor = name;
    let categoryId = "",
      productId = "";
    try {
      const created = await saveCategory(
        { nameEn: name, nameFr: "Essai" },
        actor,
      );
      categoryId = created.id;
      const category = (await listCategories()).find(
        (c) => c.id === categoryId,
      )!;
      await assert.rejects(
        saveCategory({ nameEn: name.toLowerCase(), nameFr: "Doublon" }, actor),
        /already exists/,
      );
      const product = {
        name,
        sku: "",
        barcode: "",
        cost: 1,
        srp: 2,
        orderUnit: "case",
        unitsPerOrder: 12,
        unitLabel: "items",
        category: name,
        style: "",
        description: "",
        image: "",
        status: "available",
        agentCodes: [],
      };
      await assert.rejects(
        saveProduct({ ...product, category: `${name}-missing` }, actor),
        /Choose a category/,
      );
      productId = (await saveProduct(product, actor)).id;
      assert.equal(
        (await listCategories()).find((c) => c.id === categoryId)?.productCount,
        1,
      );
      await assert.rejects(
        deleteCategory(categoryId, category.version, actor),
        /used by products/,
      );
      await db()`update terranova.products set archived=true where id=${productId}`;
      await assert.rejects(
        deleteCategory(categoryId, category.version, actor),
        /used by products/,
      );
      await db()`update terranova.products set archived=false where id=${productId}`;
      await saveCategory(
        {
          ...category,
          nameEn: `${name}-renamed`,
          nameFr: "Nouvelle catégorie",
        },
        actor,
      );
      assert.equal(
        (await listProducts()).find((p) => p.id === productId)?.category,
        `${name}-renamed`,
      );
      assert.equal(
        (await listCategories()).find((c) => c.id === categoryId)?.nameFr,
        "Nouvelle catégorie",
      );
      await assert.rejects(
        saveCategory(category, actor),
        /Reload before saving/,
      );
      await db()`delete from terranova.products where id=${productId}`;
      productId = "";
      const updated = (await listCategories()).find(
        (c) => c.id === categoryId,
      )!;
      assert.equal(updated.productCount, 0);
      await assert.rejects(
        deleteCategory(categoryId, category.version, actor),
        /Reload before deleting/,
      );
      await deleteCategory(categoryId, updated.version, actor);
      assert.equal(
        (await listCategories()).some((c) => c.id === categoryId),
        false,
      );
      categoryId = "";
    } finally {
      if (productId)
        await db()`delete from terranova.products where id=${productId}`;
      if (categoryId)
        await db()`delete from terranova.categories where id=${categoryId}`;
      await db()`delete from terranova.audit_events where actor=${actor}`;
      await db().end();
    }
  },
);
