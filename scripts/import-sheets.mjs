/** Input: JSON with Products, Vendors, Orders arrays of header-keyed row objects, plus Counter number.
 * Default is validation only. --apply imports into an empty app database, atomically, without email.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { createHash } from "node:crypto";
const filename = process.argv[2];
if (!filename || filename.startsWith("--")) {
  console.error(
    "Usage: npm run db:import -- migration-data/export.json [--apply]",
  );
  process.exit(1);
}
const raw = await readFile(filename, "utf8"),
  source = JSON.parse(raw),
  errors = [],
  warnings = [];
for (const key of ["Products", "Vendors", "Orders"])
  if (!Array.isArray(source[key]))
    errors.push(`${key} must be an array of objects keyed by sheet headers`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const string = (v) => String(v ?? "").trim(),
  code = (v) => string(v).toUpperCase(),
  truth = (v) => v === true || string(v).toUpperCase() === "TRUE";
const amount = (v, where) => {
  const n = Number(v);
  if (!string(v) || !Number.isFinite(n) || n < 0) errors.push(`Invalid amount at ${where}`);
  return n;
};
const products = source.Products.filter((p) => string(p.id));
const vendors = source.Vendors.filter(
  (v) => string(v.code) && !string(v.storeCode),
);
const stores = source.Vendors.filter(
  (v) => string(v.code) && string(v.storeCode),
);
const unique = (rows, key, label) => {
  const seen = new Set();
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) errors.push(`Duplicate ${label}: ${k}`);
    seen.add(k);
  }
};
unique(products, (p) => string(p.id), "product ID");
unique(vendors, (v) => code(v.code), "agent code");
unique(
  stores,
  (s) => `${code(s.code)}/${code(s.storeCode)}`,
  "agent/store pair",
);
const agentCodes = new Set(vendors.map((v) => code(v.code)));
for (const v of vendors) {
  if (!string(v.company)) errors.push(`Agent ${code(v.code)} has no company`);
  if (!/^[A-Z0-9_-]{3,64}$/.test(code(v.code)))
    errors.push(`Invalid agent code ${code(v.code)}`);
}
for (const s of stores) {
  if (!agentCodes.has(code(s.code)))
    errors.push(`Store ${code(s.storeCode)} has no parent agent`);
  if (!string(s.email) || !string(s.firstName) || !string(s.lastName))
    errors.push(`Store ${code(s.storeCode)} has missing contact fields`);
}
for (const p of products) {
  if (!string(p.name)) errors.push(`Product ${p.id} has no name`);
  amount(p.cost || 0, `product ${p.id} cost`);
  amount(p.srp, `product ${p.id} SRP`);
  if (!Number.isInteger(Number(p.unitsPerOrder)) || Number(p.unitsPerOrder) < 1)
    errors.push(`Product ${p.id} has invalid pack size`);
  try {
    p._codes = JSON.parse(p.vendorCodes || "[]");
    if (!Array.isArray(p._codes)) throw Error();
    p._codes = p._codes.map(code);
    for (const c of p._codes)
      if (!agentCodes.has(c))
        errors.push(`Product ${p.id} references missing agent ${c}`);
  } catch {
    errors.push(`Product ${p.id} has invalid vendorCodes JSON`);
  }
  const image = string(p.img).replace(/^\/?images\//, "");
  if (image && !/^[\w.-]+$/.test(image))
    errors.push(`Product ${p.id} needs manual image mapping`);
}
const groups = new Map();
for (const [i, row] of source.Orders.entries()) {
  const ref = string(row["Order ID"]);
  if (!ref) continue;
  const isTotal = /\s+—\s+TOTAL$/.test(ref),
    id = ref.replace(/\s+—\s+TOTAL$/, "");
  const g = groups.get(id) || { id, lines: [], total: null, rows: [] };
  g.rows.push(i + 2);
  if (isTotal) {
    if (g.total) errors.push(`Duplicate TOTAL row for ${id}`);
    g.total = row;
  } else g.lines.push(row);
  groups.set(id, g);
}
for (const g of groups.values()) {
  if (!g.total || !g.lines.length) {
    errors.push(`Order ${g.id} lacks lines or TOTAL row`);
    continue;
  }
  let dealer = 0,
    retail = 0,
    qty = 0,
    units = 0;
  for (const l of g.lines) {
    const q = Number(l["Order Qty"]),
      u = Number(l["Total Units"]);
    if (!Number.isInteger(q) || q < 1 || !Number.isInteger(u / q) || u / q < 1)
      errors.push(`Order ${g.id} has invalid pack/quantity`);
    qty += q;
    units += u;
    dealer += Math.round(amount(l["Line Dealer ($)"], g.id) * 100);
    retail += Math.round(amount(l["Line SRP ($)"], g.id) * 100);
    amount(l["Dealer/Unit ($)"], g.id);
    amount(l["SRP/Unit ($)"], g.id);
  }
  if (
    dealer !== Math.round(Number(g.total["Line Dealer ($)"]) * 100) ||
    retail !== Math.round(Number(g.total["Line SRP ($)"]) * 100) ||
    qty !== Number(g.total["Order Qty"]) ||
    units !== Number(g.total["Total Units"])
  )
    errors.push(`Order ${g.id} TOTAL does not reconcile with its lines`);
  const date = string(g.total.Date || g.lines[0].Date);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(date))
    errors.push(`Order ${g.id} has unsupported date format`);
  if (!agentCodes.has(code(g.total["Vendor Code"])))
    warnings.push(
      `Order ${g.id}: unmatched agent retained as historical snapshot`,
    );
}
if (!Number.isSafeInteger(Number(source.Counter)) || Number(source.Counter) < 0)
  errors.push("Counter must contain the exported nonnegative integer counter");
const report = {
  products: products.length,
  agents: vendors.length,
  companies: new Set(vendors.map((v) => string(v.company))).size,
  stores: stores.length,
  orders: groups.size,
  orderLines: [...groups.values()].reduce((s, g) => s + g.lines.length, 0),
  warnings,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  process.exitCode = 1;
} else if (!process.argv.includes("--apply")) {
  console.log(
    "Dry run only. Review company groupings, images and warnings before --apply.",
  );
} else {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(872391101)`;
      const [existing] =
        await tx`select (select count(*) from terranova.products)+(select count(*) from terranova.agents)+(select count(*) from terranova.stores)+(select count(*) from terranova.orders) as count`;
      if (Number(existing.count) > 0)
        throw new Error(
          "Import requires empty application tables. Refusing to overwrite existing data.",
        );
      const agents = new Map(),
        storeIds = new Map(),
        productIds = new Map();
      for (const v of vendors) {
        const [c] =
          await tx`insert into terranova.companies (name) values (${string(v.company)}) on conflict(name) do update set name=excluded.name returning id`;
        const [a] =
          await tx`insert into terranova.agents (company_id,code,first_name,last_name,email) values (${c.id},${code(v.code)},${string(v.firstName)},${string(v.lastName)},${string(v.email)}) returning id`;
        agents.set(code(v.code), a.id);
      }
      for (const s of stores) {
        const [r] =
          await tx`insert into terranova.stores (agent_id,code,first_name,last_name,email) values (${agents.get(code(s.code))},${code(s.storeCode)},${string(s.firstName)},${string(s.lastName)},${string(s.email)}) returning id`;
        storeIds.set(`${code(s.code)}/${code(s.storeCode)}`, r.id);
      }
      for (const p of products) {
        const status =
          p.status ||
          (p.available === false || p.available === "FALSE"
            ? "unavailable"
            : "available");
        const [r] =
          await tx`insert into terranova.products ${tx({ legacy_id: string(p.id), name: string(p.name), sku: string(p.sku), barcode: string(p.barcode), cost: Number(p.cost || 0), srp: Number(p.srp), order_unit: string(p.orderUnit) || "unit", units_per_order: Number(p.unitsPerOrder), unit_label: string(p.unitLabel) || "units", category: string(p.category) || "Gift Novelties", style: string(p.style), description: string(p.description), image: string(p.img) ? "/images/" + string(p.img).replace(/^\/?images\//, "") : "", status, restricted: p._codes.length > 0 })} returning id`;
        productIds.set(string(p.id), r.id);
        for (const c of new Set(p._codes))
          await tx`insert into terranova.product_agents (product_id,agent_id) values (${r.id},${agents.get(c)})`;
      }
      for (const g of groups.values()) {
        const t = g.total,
          agentCode = code(t["Vendor Code"]),
          storeCode = code(t["Store Code"]),
          date = string(t.Date || g.lines[0].Date);
        const [o] =
          await tx`insert into terranova.orders ${tx({ reference: g.id, agent_id: agents.get(agentCode) || null, store_id: storeIds.get(`${agentCode}/${storeCode}`) || null, company_name: string(t.Company), agent_name: string(t["Agent Name"]), agent_email: string(t["Agent Email"]), agent_code: agentCode, store_code: storeCode, contact_name: "", customer_email: string(t["Customer Email"]), comments: string(t.Comments), order_sent: truth(t["Order Sent"]), invoice_sent: truth(t["Invoice Sent"]), payment_received: truth(t["Payment Received"]), cancelled: truth(t.Cancelled), total_dealer: Number(t["Line Dealer ($)"]), total_retail: Number(t["Line SRP ($)"]) })} returning id`;
        if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(date))
          await tx`update terranova.orders set created_at=${date}::timestamptz where id=${o.id}`;
        else
          await tx`update terranova.orders set created_at=(${date}::timestamp at time zone 'America/Toronto') where id=${o.id}`;
        for (const l of g.lines) {
          const matches = products.filter(
            (p) =>
              string(p.name) === string(l.Product) &&
              string(p.sku) === string(l.SKU) &&
              string(p.barcode) === string(l.Barcode),
          );
          await tx`insert into terranova.order_lines ${tx({ order_id: o.id, product_id: matches.length === 1 ? productIds.get(string(matches[0].id)) : null, name: string(l.Product), sku: string(l.SKU), barcode: string(l.Barcode), order_unit: string(l["Order Unit"]), unit_label: "units", units_per_order: Number(l["Total Units"]) / Number(l["Order Qty"]), cost: null, dealer_unit: Number(l["Dealer/Unit ($)"]), srp_unit: Number(l["SRP/Unit ($)"]), qty: Number(l["Order Qty"]), line_dealer: Number(l["Line Dealer ($)"]), line_retail: Number(l["Line SRP ($)"]) })}`;
        }
        await tx`insert into terranova.audit_events (actor,action,entity_id,details) values ('migration','order.imported',${o.id},${tx.json({ sourceRows: g.rows, sourceHash: createHash("sha256").update(raw).digest("hex") })})`;
      }
      const maxSequence = Math.max(
        Number(source.Counter),
        ...[...groups.keys()].map((ref) =>
          Number(ref.match(/-(\d+)$/)?.[1] || 0),
        ),
      );
      await tx`select setval('terranova.order_number',${Math.max(1, maxSequence)},${maxSequence > 0})`;
    });
    console.log("Import committed. No notification jobs were created.");
  } catch (e) {
    console.error("Import rolled back:", e.code || e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
