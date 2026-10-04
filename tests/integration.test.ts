import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  saveAgent,
  saveStore,
  saveProduct,
  listProducts,
  submitOrder,
  editOrder,
  getOrder,
  deleteProduct,
  lookupStore,
} from "../src/lib/repository";
test(
  "database order/access workflow, atomic retries and historic line editing",
  { skip: !process.env.RUN_DB_TESTS },
  async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase(),
      company = `TEST-${suffix}`,
      code = `TEST-${suffix}`,
      other = `OTHER-${suffix}`,
      actor = `test-${suffix}`;
    let productId = "";
    try {
      await saveAgent(
        {
          company,
          code,
          firstName: "Test",
          lastName: "Agent",
          email: "",
          active: true,
        },
        actor,
      );
      await saveAgent(
        {
          company,
          code: other,
          firstName: "Other",
          lastName: "Agent",
          email: "",
          active: true,
        },
        actor,
      );
      const store = await saveStore(
        {
          vendorCode: code,
          storeCode: "001",
          firstName: "Test",
          lastName: "Store",
          email: "test@example.invalid",
        },
        actor,
      );
      assert.equal(await lookupStore(other, "001"), null);
      await assert.rejects(
        saveStore(
          {
            vendorCode: code,
            storeCode: "001",
            firstName: "Different",
            lastName: "Contact",
            email: "other@example.invalid",
          },
          actor,
        ),
        /already exists/,
      );
      assert.equal(
        (await lookupStore(code, "001"))?.email,
        "test@example.invalid",
      );
      const product = {
        name: `TEST-${suffix}`,
        sku: "00TEST",
        barcode: "00001",
        cost: 1.25,
        srp: 3,
        orderUnit: "case",
        unitsPerOrder: 6,
        unitLabel: "items",
        category: "Test",
        style: "",
        description: "",
        image: "",
        status: "available",
        agentCodes: [code],
      };
      const saved = await saveProduct(product, actor);
      productId = saved.id;
      assert.equal(
        (await listProducts(other)).some((p) => p.id === productId),
        false,
      );
      assert.equal(
        (await listProducts(code)).some((p) => p.id === productId),
        true,
      );
      const input = {
        vendorCode: code,
        storeCode: store.storeCode,
        comments: "Test only",
        idempotencyKey: randomUUID(),
        lines: [{ productId, qty: 2 }],
        totalDealer: 0.01,
      };
      const [first, retry] = await Promise.all([
        submitOrder(input),
        submitOrder(input),
      ]);
      assert.equal(first.id, retry.id);
      assert.equal(first.totalDealer, 16.65);
      assert.equal(first.totalRetail, 36);
      const [count] =
        await db()`select count(*)::int as count from terranova.orders where idempotency_key=${input.idempotencyKey}`;
      assert.equal(count.count, 1);
      await assert.rejects(
        submitOrder({ ...input, lines: [{ productId, qty: 3 }] }),
        /different order/,
      );
      await assert.rejects(
        submitOrder({
          ...input,
          idempotencyKey: randomUUID(),
          vendorCode: other,
        }),
        /store first/,
      );
      const current = (await listProducts(code)).find(
        (p) => p.id === productId,
      )!;
      await saveProduct({ ...current, cost: 99 }, actor);
      const edited = await editOrder(
        { ...first, lines: [{ id: first.lines[0].id, qty: 3 }] },
        actor,
      );
      assert.equal(edited.totalDealer, 24.98);
      await assert.rejects(
        editOrder(
          { ...first, lines: [{ id: first.lines[0].id, qty: 4 }] },
          actor,
        ),
        /changed/,
      );
      await assert.rejects(
        editOrder({ ...edited, lines: [{ id: randomUUID(), qty: 4 }] }, actor),
        /Unknown order line/,
      );
      assert.equal((await getOrder(first.id)).totalDealer, 24.98);
      await deleteProduct(productId, actor);
      assert.equal((await getOrder(first.id)).lines[0].name, product.name);
      await assert.rejects(
        submitOrder({ ...input, idempotencyKey: randomUUID() }),
        /no longer available/,
      );
      const [after] =
        await db()`select count(*)::int as count from terranova.orders where agent_code=${code}`;
      assert.equal(after.count, 1);
      const [outbox] =
        await db()`select count(*)::int as count from terranova.email_outbox where order_id=${first.id}`;
      assert.ok(outbox.count >= 1);
    } finally {
      await db().begin(async (tx) => {
        const ids =
          await tx`select id from terranova.orders where agent_code=${code}`;
        for (const { id } of ids) {
          await tx`delete from terranova.email_outbox where order_id=${id}`;
          await tx`delete from terranova.order_lines where order_id=${id}`;
          await tx`delete from terranova.audit_events where entity_id=${id}`;
          await tx`delete from terranova.orders where id=${id}`;
        }
        if (productId) {
          await tx`delete from terranova.product_agents where product_id=${productId}`;
          await tx`delete from terranova.products where id=${productId}`;
        }
        await tx`delete from terranova.stores where agent_id in(select id from terranova.agents where code in (${code},${other}))`;
        await tx`delete from terranova.agents where code in (${code},${other})`;
        await tx`delete from terranova.companies where name=${company}`;
        await tx`delete from terranova.audit_events where actor=${actor}`;
      });
      await db().end();
    }
  },
);
