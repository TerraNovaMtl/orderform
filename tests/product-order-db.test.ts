import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  saveCategory,
  saveProduct,
  listProducts,
  reorderProducts,
} from "../src/lib/repository";

test(
  "product order persists, appends new products and rejects stale or incomplete changes",
  { skip: !process.env.RUN_PRODUCT_ORDER_DB_TESTS },
  async () => {
    const name = `ORDER-${randomUUID()}`;
    const ids: string[] = [];
    let categoryId = "";
    try {
      categoryId = (await saveCategory({ nameEn: name, nameFr: name }, name))
        .id;
      for (const suffix of ["a", "b"])
        ids.push(
          (
            await saveProduct(
              {
                name: `${name}-${suffix}`,
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
              },
              name,
            )
          ).id,
        );
      const before = (await listProducts()).map((p) => p.id);
      assert.deepEqual(before.slice(-2), ids);
      const ordered = [...before.slice(0, -2), ids[1], ids[0]];
      await reorderProducts(ordered, before, name);
      assert.deepEqual(
        (await listProducts()).map((p) => p.id),
        ordered,
      );
      await assert.rejects(
        reorderProducts(before, before, name),
        /order changed/,
      );
      await assert.rejects(
        reorderProducts(ordered.slice(1), ordered, name),
        /list changed/,
      );
      assert.deepEqual(
        (await listProducts()).map((p) => p.id),
        ordered,
      );
    } finally {
      for (const id of ids)
        await db()`delete from terranova.products where id=${id}`;
      if (categoryId)
        await db()`delete from terranova.categories where id=${categoryId}`;
      await db()`delete from terranova.audit_events where actor=${name}`;
      await db().end();
    }
  },
);
