import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  saveCategory,
  saveAgent,
  saveStore,
  saveProduct,
  listProducts,
  submitOrder,
  editOrder,
  getOrder,
  deleteProduct,
  deleteOrder,
  deleteAgent,
  deleteCompany,
  getAgent,
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
      await saveCategory({ nameEn: company, nameFr: company }, actor);
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
        category: company,
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
      const [companyRow] =
        await db()`select id from terranova.companies where name=${company}`;
      await saveProduct(
        {
          ...current,
          cost: null,
          dealerPrice: 3.33,
          minimumOrder: 4,
          companyId: companyRow.id,
        },
        actor,
      );
      await assert.rejects(
        submitOrder({
          ...input,
          idempotencyKey: randomUUID(),
          lines: [{ productId, qty: 3 }],
        }),
        /Minimum order/,
      );
      const explicit = await submitOrder({
        ...input,
        idempotencyKey: randomUUID(),
        customerPo: "PO-TEST",
        contactPhone: "555-0100",
        lines: [{ productId, qty: 4 }],
      });
      assert.equal(explicit.totalDealer, 79.92);
      assert.equal(explicit.customerPo, "PO-TEST");
      assert.equal(explicit.contactPhone, "555-0100");
      assert.equal(explicit.lines[0].cost, null);
      const foreign = await saveAgent(
        {
          company: `FOREIGN-${suffix}`,
          code: `FOREIGN-${suffix}`,
          firstName: "",
          lastName: "",
          email: "",
          active: true,
        },
        actor,
      );
      assert.equal(
        (await listProducts(`FOREIGN-${suffix}`)).some(
          (p) => p.id === productId,
        ),
        false,
      );
      const [foreignCompany] =
        await db()`select id from terranova.companies where name=${`FOREIGN-${suffix}`}`;
      await assert.rejects(
        deleteCompany(foreignCompany.id, actor),
        /agent\(s\)/,
      );
      await deleteAgent(foreign.id, actor);
      await deleteCompany(foreignCompany.id, actor);
      const [deletedCompany] =
        await db()`select count(*)::int as count from terranova.companies where id=${foreignCompany.id}`;
      assert.equal(deletedCompany.count, 0);
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
      await assert.rejects(deleteCompany(companyRow.id, actor), /product\(s\)/);
      await deleteProduct(productId, actor);
      assert.equal((await getOrder(first.id)).lines[0].name, product.name);
      await assert.rejects(
        submitOrder({ ...input, idempotencyKey: randomUUID() }),
        /no longer available/,
      );
      const [after] =
        await db()`select count(*)::int as count from terranova.orders where agent_code=${code}`;
      assert.equal(after.count, 2);
      const [outbox] =
        await db()`select count(*)::int as count from terranova.email_outbox where order_id=${first.id}`;
      assert.ok(outbox.count >= 1);
      await assert.rejects(
        deleteOrder(first.id, first.version, actor),
        /changed/,
      );
      await db()`update terranova.email_outbox set state='sending' where order_id=${first.id}`;
      await assert.rejects(
        deleteOrder(first.id, edited.version, actor),
        /being sent/,
      );
      assert.equal((await getOrder(first.id)).totalDealer, 24.98);
      await db()`update terranova.email_outbox set state='pending' where order_id=${first.id}`;
      await deleteOrder(first.id, edited.version, actor);
      await assert.rejects(getOrder(first.id));
      const [deleted] = await db()`select
        (select count(*)::int from terranova.order_lines where order_id=${first.id}) as lines,
        (select count(*)::int from terranova.email_outbox where order_id=${first.id}) as emails,
        (select count(*)::int from terranova.audit_events where entity_id=${first.id} and action='order.deleted' and actor=${actor}) as audit`;
      assert.deepEqual({ ...deleted }, { lines: 0, emails: 0, audit: 1 });
      assert.equal((await getOrder(explicit.id)).totalDealer, 79.92);
      const [testAgent] =
        await db()`select id from terranova.agents where code=${code}`;
      await db()`update terranova.products set restricted=true where id=${productId}`;
      await db()`insert into terranova.product_agents (product_id,agent_id) values (${productId},${testAgent.id}) on conflict do nothing`;
      await deleteAgent(testAgent.id, actor);
      await assert.rejects(getAgent(code));
      const preserved = await getOrder(explicit.id);
      assert.equal(preserved.totalDealer, 79.92);
      assert.equal(preserved.agentName, "Test Agent");
      assert.equal(preserved.storeCode, "001");
      const [links] = await db()`select
        (select count(*)::int from terranova.stores where agent_id=${testAgent.id}) as stores,
        (select count(*)::int from terranova.product_agents where agent_id=${testAgent.id}) as products`;
      assert.deepEqual({ ...links }, { stores: 0, products: 0 });
      const [restricted] =
        await db()`select restricted,company_id from terranova.products where id=${productId}`;
      assert.equal(restricted.restricted, true);
      assert.equal(restricted.company_id, companyRow.id);
      const [otherAgent] =
        await db()`select id from terranova.agents where code=${other}`;
      await deleteAgent(otherAgent.id, actor);
      await deleteCompany(companyRow.id, actor);
      assert.equal((await getOrder(explicit.id)).company, company);
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
        await tx`delete from terranova.categories where name_en=${company}`;
        await tx`delete from terranova.audit_events where actor=${actor}`;
      });
      await db().end();
    }
  },
);
