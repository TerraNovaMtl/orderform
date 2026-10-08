import { createHash } from "node:crypto";
import { db, type Tx } from "./db";
import {
  agentSchema,
  companySchema,
  type Company,
  productSchema,
  storeSchema,
  orderSchema,
  editOrderSchema,
  productAmounts,
  snapshotAmounts,
  sumMoney,
  type Product,
  type Agent,
  type Store,
  type Order,
  type OrderLine,
} from "./domain";
import type { Row } from "postgres";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const notFound = () => new AppError("Not found", 404);
export async function audit(
  tx: Tx,
  actor: string,
  action: string,
  id: string,
  details: object = {},
) {
  await tx`insert into terranova.audit_events (actor, action, entity_id, details) values (${actor}, ${action}, ${id}, ${tx.json(JSON.parse(JSON.stringify(details)))})`;
}
function mapAgent(r: Row): Agent {
  return {
    id: r.id,
    code: r.code,
    company: r.company,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    active: r.active,
  };
}
export async function agentByCode(
  code: string,
  sql: ReturnType<typeof db> | Tx = db(),
) {
  const [r] =
    await sql`select a.*, c.name as company from terranova.agents a join terranova.companies c on c.id=a.company_id where a.code=${code.toUpperCase()} and a.active=true`;
  if (!r) throw notFound();
  return r;
}
export async function getAgent(code: string) {
  const a = mapAgent(await agentByCode(code));
  return { ...a, email: undefined };
}
export async function listCompanies(): Promise<Company[]> {
  const rows =
    await db()`select id,name from terranova.companies order by name`;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}
export async function saveCompany(input: unknown, actor: string) {
  const c = companySchema.parse(input);
  return db().begin(async (tx) => {
    const [row] =
      await tx`insert into terranova.companies (name) values (${c.name}) on conflict(name) do nothing returning id`;
    if (!row) throw new AppError("This company already exists.", 409);
    await audit(tx, actor, "company.created", row.id, { name: c.name });
    return { id: row.id };
  });
}
export async function listAgents(): Promise<Agent[]> {
  return (
    await db()`select a.*, c.name as company from terranova.agents a join terranova.companies c on c.id=a.company_id order by c.name,a.code`
  ).map(mapAgent);
}
export async function deleteCompany(id: string, actor: string) {
  await db().begin(async (tx) => {
    const [company] =
      await tx`select * from terranova.companies where id=${id} for update`;
    if (!company) throw notFound();
    const [dependencies] = await tx`select
      (select count(*)::int from terranova.agents where company_id=${id}) as agents,
      (select count(*)::int from terranova.products where company_id=${id} and archived=false) as products`;
    if (dependencies.agents || dependencies.products)
      throw new AppError(
        `Remove or reassign this company's ${dependencies.agents} agent(s) and ${dependencies.products} product(s) before deleting it.`,
        409,
      );
    await tx`update terranova.products set company_id=null,version=version+1 where company_id=${id} and archived=true`;
    await tx`delete from terranova.companies where id=${id}`;
    await audit(tx, actor, "company.deleted", id, { name: company.name });
  });
}
export async function deleteAgent(id: string, actor: string) {
  await db().begin(async (tx) => {
    const [agent] =
      await tx`select * from terranova.agents where id=${id} for update`;
    if (!agent) throw notFound();
    // Orders retain their company, agent and store snapshots after these links are cleared.
    await tx`update terranova.orders set agent_id=null where agent_id=${id}`;
    await tx`update terranova.orders set store_id=null where store_id in (select id from terranova.stores where agent_id=${id})`;
    const stores =
      await tx`delete from terranova.stores where agent_id=${id} returning id`;
    await tx`delete from terranova.product_agents where agent_id=${id}`;
    // Keep restricted=true on products, even if their last assigned agent is removed.
    await tx`delete from terranova.agents where id=${id}`;
    await audit(tx, actor, "agent.deleted", id, {
      code: agent.code,
      storesDeleted: stores.length,
    });
  });
}
export async function saveAgent(input: unknown, actor: string) {
  const a = agentSchema.parse(input);
  return db().begin(async (tx) => {
    const [c] =
      await tx`insert into terranova.companies (name) values (${a.company}) on conflict(name) do update set name=excluded.name returning id`;
    const values = {
      company_id: c.id,
      code: a.code,
      first_name: a.firstName,
      last_name: a.lastName,
      email: a.email,
      active: a.active,
    };
    const [row] = a.id
      ? await tx`update terranova.agents set ${tx(values)} where id=${a.id} returning id`
      : await tx`insert into terranova.agents ${tx(values)} returning id`;
    if (!row) throw notFound();
    await audit(tx, actor, "agent.saved", row.id);
    return { id: row.id };
  });
}
function mapStore(r: Row): Store {
  return {
    id: r.id,
    vendorCode: r.vendor_code,
    storeCode: r.code,
    company: r.company,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
  };
}
export async function lookupStore(vendor: string, store: string) {
  const a = await agentByCode(vendor);
  const [r] =
    await db()`select * from terranova.stores where agent_id=${a.id} and code=${store.toUpperCase()} and active=true`;
  return r ? mapStore({ ...r, vendor_code: a.code, company: a.company }) : null;
}
export async function listStores(): Promise<Store[]> {
  return (
    await db()`select s.*, a.code as vendor_code, c.name as company from terranova.stores s join terranova.agents a on a.id=s.agent_id join terranova.companies c on c.id=a.company_id where s.active=true order by c.name,a.code,s.code`
  ).map(mapStore);
}
export async function saveStore(input: unknown, actor = "customer") {
  const s = storeSchema.parse(input);
  return db().begin(async (tx) => {
    const a = await agentByCode(s.vendorCode, tx);
    const [r] = s.id
      ? await tx`update terranova.stores set code=${s.storeCode},first_name=${s.firstName},last_name=${s.lastName},email=${s.email.toLowerCase()},updated_at=now() where id=${s.id} and agent_id=${a.id} and active=true returning *`
      : await tx`insert into terranova.stores (agent_id,code,first_name,last_name,email) values (${a.id},${s.storeCode},${s.firstName},${s.lastName},${s.email.toLowerCase()}) on conflict(agent_id,code) do nothing returning *`;
    if (!r)
      throw new AppError(
        "This store already exists or changed. Look it up again, or contact your agent.",
        409,
      );
    await audit(tx, actor, "store.saved", r.id, {
      agentCode: a.code,
      storeCode: r.code,
    });
    return mapStore({ ...r, vendor_code: a.code, company: a.company });
  });
}
export async function deleteStore(id: string, actor: string) {
  await db().begin(async (tx) => {
    const [r] =
      await tx`update terranova.stores set active=false where id=${id} returning id`;
    if (!r) throw notFound();
    await audit(tx, actor, "store.disabled", id);
  });
}
function mapProduct(r: Row): Product {
  return {
    id: r.id,
    version: r.version,
    name: r.name,
    sku: r.sku,
    barcode: r.barcode,
    cost: r.cost == null ? null : Number(r.cost),
    dealerPrice: r.dealer_price == null ? null : Number(r.dealer_price),
    minimumOrder: r.minimum_order,
    companyId: r.company_id,
    srp: Number(r.srp),
    orderUnit: r.order_unit,
    unitsPerOrder: r.units_per_order,
    unitLabel: r.unit_label,
    category: r.category,
    style: r.style,
    description: r.description,
    image: r.image,
    status: r.status,
    agentCodes: r.agent_codes || [],
  };
}
export async function listProducts(vendor?: string): Promise<Product[]> {
  const a = vendor ? await agentByCode(vendor) : null;
  const sql = db();
  const rows =
    await sql`select p.*, coalesce((select json_agg(a.code order by a.code) from terranova.product_agents pa join terranova.agents a on a.id=pa.agent_id where pa.product_id=p.id),'[]'::json) as agent_codes from terranova.products p where p.archived=false ${a ? sql`and (p.company_id is null or p.company_id=${a.company_id}) and p.status<>'hidden' and (not p.restricted or exists(select 1 from terranova.product_agents pa where pa.product_id=p.id and pa.agent_id=${a.id}))` : sql``} order by p.category,p.name`;
  const mappings =
    a && rows.length
      ? await sql`select product_id,product_key from terranova.catalog_imports where catalog_key='fma-2026' and product_id in ${sql(rows.map((r) => r.id))}`
      : [];
  return rows.map(mapProduct).map((p) =>
    a
      ? {
          ...p,
          agentCodes: [],
          catalogKey: mappings.find((m) => m.product_id === p.id)?.product_key,
        }
      : p,
  );
}
export async function saveProduct(input: unknown, actor: string) {
  const p = productSchema.parse(input);
  return db().begin(async (tx) => {
    const agents = p.agentCodes.length
      ? await tx`select id,code from terranova.agents where code in ${tx(p.agentCodes)}`
      : [];
    if (agents.length !== new Set(p.agentCodes).size)
      throw new AppError("One or more agent codes do not exist");
    const v = {
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      cost: p.cost,
      dealer_price: p.dealerPrice ?? null,
      minimum_order: p.minimumOrder ?? 1,
      company_id: p.companyId ?? null,
      srp: p.srp,
      order_unit: p.orderUnit,
      units_per_order: p.unitsPerOrder,
      unit_label: p.unitLabel,
      category: p.category,
      style: p.style,
      description: p.description,
      image: p.image,
      status: p.status,
      restricted: p.agentCodes.length > 0,
    };
    const [row] = p.id
      ? await tx`update terranova.products set ${tx(v)}, version=version+1, updated_at=now() where id=${p.id} and version=${p.version ?? 0} and archived=false returning id`
      : await tx`insert into terranova.products ${tx(v)} returning id`;
    if (!row) throw new AppError("Product changed. Reload before saving.", 409);
    await tx`delete from terranova.product_agents where product_id=${row.id}`;
    for (const a of agents)
      await tx`insert into terranova.product_agents (product_id,agent_id) values (${row.id},${a.id})`;
    await audit(tx, actor, "product.saved", row.id);
    return { id: row.id };
  });
}
export async function deleteProduct(id: string, actor: string) {
  await db().begin(async (tx) => {
    const [r] =
      await tx`update terranova.products set archived=true,version=version+1 where id=${id} returning id`;
    if (!r) throw notFound();
    await audit(tx, actor, "product.archived", id);
  });
}
function mapLine(r: Row): OrderLine {
  return {
    id: r.id,
    productId: r.product_id,
    name: r.name,
    sku: r.sku,
    barcode: r.barcode,
    orderUnit: r.order_unit,
    unitLabel: r.unit_label,
    unitsPerOrder: r.units_per_order,
    cost: r.cost === null ? null : Number(r.cost),
    dealerUnit: Number(r.dealer_unit),
    srpUnit: Number(r.srp_unit),
    qty: r.qty,
    minimumOrder: r.minimum_order,
    lineDealer: Number(r.line_dealer),
    lineRetail: Number(r.line_retail),
  };
}
function mapOrder(r: Row, lines: Row[]): Order {
  return {
    id: r.id,
    reference: r.reference,
    version: r.version,
    date: new Date(r.created_at).toISOString(),
    company: r.company_name,
    agentCode: r.agent_code,
    agentName: r.agent_name,
    storeCode: r.store_code,
    contactName: r.contact_name,
    customerEmail: r.customer_email,
    comments: r.comments,
    customerPo: r.customer_po,
    contactPhone: r.contact_phone,
    orderSent: r.order_sent,
    invoiceSent: r.invoice_sent,
    paymentReceived: r.payment_received,
    cancelled: r.cancelled,
    totalDealer: Number(r.total_dealer),
    totalRetail: Number(r.total_retail),
    lines: lines.map(mapLine),
  };
}
export async function getOrder(
  id: string,
  sql: ReturnType<typeof db> | Tx = db(),
): Promise<Order> {
  const [r] = await sql`select * from terranova.orders where id=${id}`;
  if (!r) throw notFound();
  return mapOrder(
    r,
    await sql`select * from terranova.order_lines where order_id=${id} and removed=false order by id`,
  );
}
export async function listOrders(): Promise<Order[]> {
  const rows =
    await db()`select * from terranova.orders order by created_at desc limit 500`;
  if (!rows.length) return [];
  const lines =
    await db()`select * from terranova.order_lines where order_id in ${db()(rows.map((r) => r.id))} and removed=false order by id`;
  return rows.map((r) =>
    mapOrder(
      r,
      lines.filter((l) => l.order_id === r.id),
    ),
  );
}
export async function submitOrder(input: unknown): Promise<Order> {
  const data = orderSchema.parse(input);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        ...data,
        lines: [...data.lines].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        ),
      }),
    )
    .digest("hex");
  return db().begin(async (tx) => {
    // Serializes retries for this key without blocking unrelated orders.
    await tx`select pg_advisory_xact_lock(hashtextextended(${data.idempotencyKey},0))`;
    const [old] =
      await tx`select id,request_hash from terranova.orders where idempotency_key=${data.idempotencyKey}`;
    if (old) {
      if (old.request_hash !== hash)
        throw new AppError(
          "This submission was already used for a different order",
          409,
        );
      return getOrder(old.id, tx);
    }
    const a = await agentByCode(data.vendorCode, tx);
    const [s] =
      await tx`select * from terranova.stores where agent_id=${a.id} and code=${data.storeCode} and active=true for share`;
    if (!s) throw new AppError("Please select or register your store first");
    const lines = [];
    for (const l of data.lines) {
      const [p] =
        await tx`select * from terranova.products p where p.id=${l.productId} and not p.archived and p.status='available' and (p.company_id is null or p.company_id=${a.company_id}) and (not p.restricted or exists(select 1 from terranova.product_agents pa where pa.product_id=p.id and pa.agent_id=${a.id})) for share`;
      if (!p)
        throw new AppError(
          "A selected product is no longer available. Refresh the catalog.",
          409,
        );
      if (l.qty < p.minimum_order)
        throw new AppError(
          `Minimum order for ${p.name} is ${p.minimum_order} ${p.order_unit}s`,
        );
      const amounts = productAmounts(
        {
          cost: p.cost == null ? null : Number(p.cost),
          dealerPrice: p.dealer_price == null ? null : Number(p.dealer_price),
          srp: Number(p.srp),
        },
        l.qty * p.units_per_order,
      );
      lines.push({
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        order_unit: p.order_unit,
        unit_label: p.unit_label,
        units_per_order: p.units_per_order,
        cost: p.cost,
        dealer_unit: amounts.dealerUnit.toFixed(6),
        minimum_order: p.minimum_order,
        srp_unit: p.srp,
        qty: l.qty,
        line_dealer: amounts.lineDealer,
        line_retail: amounts.lineRetail,
      });
    }
    const [number] =
      await tx`select 'TN-' || to_char(now() at time zone 'America/Toronto','YYYYMMDD-HH24MI') || '-' || lpad(nextval('terranova.order_number')::text, 8, '0') as reference`;
    const [o] =
      await tx`insert into terranova.orders ${tx({ reference: number.reference, agent_id: a.id, store_id: s.id, company_name: a.company, agent_name: [a.first_name, a.last_name].filter(Boolean).join(" "), agent_email: a.email, agent_code: a.code, store_code: s.code, contact_name: `${s.first_name} ${s.last_name}`, customer_email: s.email, comments: data.comments, customer_po: data.customerPo ?? "", contact_phone: data.contactPhone ?? "", total_dealer: sumMoney(lines.map((l) => l.line_dealer)), total_retail: sumMoney(lines.map((l) => l.line_retail)), idempotency_key: data.idempotencyKey, request_hash: hash })} returning id`;
    for (const line of lines)
      await tx`insert into terranova.order_lines ${tx({ ...line, order_id: o.id })}`;
    const recipients = [
      ...new Set(
        [
          process.env.ORDER_EMAIL || "terranova.mtl.ai@gmail.com",
          s.email,
          a.email,
        ]
          .filter(Boolean)
          .map((x) => x!.trim().toLowerCase()),
      ),
    ];
    for (const email of recipients)
      await tx`insert into terranova.email_outbox (order_id,recipient) values (${o.id},${email})`;
    await audit(tx, "customer", "order.created", o.id, {
      agentCode: a.code,
      storeCode: s.code,
    });
    return getOrder(o.id, tx);
  });
}
export async function deleteOrder(id: string, version: number, actor: string) {
  await db().begin(async (tx) => {
    const [order] =
      await tx`select * from terranova.orders where id=${id} for update`;
    if (!order) throw notFound();
    if (order.version !== version)
      throw new AppError("This order changed. Reload before deleting.", 409);
    const deliveries =
      await tx`select state from terranova.email_outbox where order_id=${id} for update`;
    if (deliveries.some((job) => job.state === "sending"))
      throw new AppError(
        "An email is being sent for this order. Try deleting it again after delivery finishes.",
        409,
      );
    await audit(tx, actor, "order.deleted", id, {
      reference: order.reference,
      company: order.company_name,
      storeCode: order.store_code,
      totalDealer: Number(order.total_dealer),
    });
    await tx`delete from terranova.email_outbox where order_id=${id}`;
    await tx`delete from terranova.order_lines where order_id=${id}`;
    await tx`delete from terranova.orders where id=${id}`;
  });
}
export async function editOrder(input: unknown, actor: string) {
  const d = editOrderSchema.parse(input);
  return db().begin(async (tx) => {
    const [o] =
      await tx`select * from terranova.orders where id=${d.id} for update`;
    if (!o) throw notFound();
    if (o.version !== d.version)
      throw new AppError("This order changed. Reload before saving.", 409);
    const previous = await getOrder(d.id, tx);
    const lines =
      await tx`select * from terranova.order_lines where order_id=${d.id} and removed=false`;
    let dealer = 0,
      retail = 0;
    for (const line of d.lines) {
      const old = lines.find((l) => l.id === line.id);
      if (!old) throw new AppError("Unknown order line");
      if (line.qty < old.minimum_order)
        throw new AppError(
          `Minimum order is ${old.minimum_order} ${old.order_unit}s`,
        );
      const amounts = snapshotAmounts(
        old.dealer_unit,
        old.srp_unit,
        line.qty * old.units_per_order,
      );
      dealer += Math.round(amounts.lineDealer * 100);
      retail += Math.round(amounts.lineRetail * 100);
      await tx`update terranova.order_lines set qty=${line.qty},line_dealer=${amounts.lineDealer},line_retail=${amounts.lineRetail} where id=${line.id}`;
    }
    await tx`update terranova.order_lines set removed=true where order_id=${d.id} and id not in ${tx(d.lines.map((l) => l.id))}`;
    await tx`update terranova.orders set comments=${d.comments},customer_po=${d.customerPo ?? previous.customerPo ?? ""},contact_phone=${d.contactPhone ?? previous.contactPhone ?? ""},order_sent=${d.orderSent},invoice_sent=${d.invoiceSent},payment_received=${d.paymentReceived},cancelled=${d.cancelled},total_dealer=${dealer / 100},total_retail=${retail / 100},version=version+1,updated_at=now() where id=${d.id}`;
    await audit(tx, actor, "order.updated", d.id, {
      before: previous,
      after: d,
    });
    return getOrder(d.id, tx);
  });
}
