/** Read-only reconciliation against the approved migration snapshot. */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import postgres from "postgres";
const source = JSON.parse(await readFile(process.argv[2], "utf8"));
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const str = (v) => String(v ?? "").trim();
const cents = (v) => Math.round(Number(v) * 100);
const truth = (v) => v === true || str(v).toUpperCase() === "TRUE";
try {
  const orders = await sql`select * from terranova.orders order by reference`;
  const totals = source.Orders.filter(r => / — TOTAL$/.test(str(r["Order ID"])));
  assert.equal(orders.length, totals.length);
  for (const t of totals) {
    const ref = str(t["Order ID"]).replace(/ — TOTAL$/, "");
    const o = orders.find(r => r.reference === ref);
    assert.ok(o, `Missing ${ref}`);
    assert.equal(cents(o.total_dealer), cents(t["Line Dealer ($)"]));
    assert.equal(cents(o.total_retail), cents(t["Line SRP ($)"]));
    for (const [field, header] of [["order_sent", "Order Sent"], ["invoice_sent", "Invoice Sent"], ["payment_received", "Payment Received"], ["cancelled", "Cancelled"]]) assert.equal(o[field], truth(t[header]));
    for (const [field, header] of [["company_name", "Company"], ["agent_name", "Agent Name"], ["agent_email", "Agent Email"], ["customer_email", "Customer Email"], ["comments", "Comments"]]) assert.equal(o[field], str(t[header]));
    const lines = await sql`select * from terranova.order_lines where order_id=${o.id}`;
    const expected = source.Orders.filter(r => str(r["Order ID"]) === ref);
    assert.equal(lines.length, expected.length);
    const signature = r => JSON.stringify(r);
    const actualLines = lines.map(l => signature([l.name,l.sku,l.barcode,Number(l.qty),Number(l.units_per_order),Number(l.dealer_unit),Number(l.srp_unit),cents(l.line_dealer),cents(l.line_retail)])).sort();
    const expectedLines = expected.map(l => signature([str(l.Product),str(l.SKU),str(l.Barcode),Number(l["Order Qty"]),Number(l["Total Units"])/Number(l["Order Qty"]),Number(l["Dealer/Unit ($)"]),Number(l["SRP/Unit ($)"]),cents(l["Line Dealer ($)"]),cents(l["Line SRP ($)"])])).sort();
    assert.deepEqual(actualLines, expectedLines, ref);
  }
  const [counts] = await sql`select (select count(*) from terranova.products)::int products, (select count(*) from terranova.agents)::int agents, (select count(*) from terranova.stores)::int stores, (select count(*) from terranova.companies)::int companies, (select count(*) from terranova.order_lines)::int lines, (select count(*) from terranova.email_outbox)::int emails`;
  assert.equal(counts.products, source.Products.filter(p => str(p.id)).length);
  assert.equal(counts.agents, source.Vendors.filter(v => str(v.code) && !str(v.storeCode)).length);
  assert.equal(counts.stores, source.Vendors.filter(v => str(v.code) && str(v.storeCode)).length);
  assert.equal(counts.emails, 0);
  console.log(JSON.stringify({verified: true, ...counts, orders: orders.length, sourceWorkbookSha256: source._source.sha256}, null, 2));
} finally { await sql.end(); }
