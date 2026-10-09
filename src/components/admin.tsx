"use client";
import { CategoryFilter } from "./category-filter";
import { useEffect, useState } from "react";
import {
  type Category,
  type Product,
  type Company,
  type ProductInput,
  type Agent,
  type Store,
  type Order,
  moneyFormat as money,
  snapshotAmounts,
  dealerPrice,
  sumMoney,
} from "@/lib/domain";
import { Modal, OrderReceipt, request, exportOrder } from "./shared";
type Data = {
  categories: Category[];
  companies: Company[];
  products: Product[];
  agents: Agent[];
  stores: Store[];
  orders: Order[];
  notifications: { state: string; count: number }[];
};
const blankProduct: ProductInput = {
  name: "",
  sku: "",
  barcode: "",
  cost: 0,
  srp: 0,
  orderUnit: "unit",
  unitsPerOrder: 1,
  unitLabel: "units",
  category: "",
  style: "",
  description: "",
  image: "",
  status: "available",
  agentCodes: [],
};
type AgentInput = Omit<Agent, "id"> & { id?: string };
type StoreInput = Omit<Store, "id"> & { id?: string };
export function Admin() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<
      "orders" | "products" | "agents" | "stores" | "categories"
    >("orders"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [cancelled, setCancelled] = useState(false);
  const [hiddenProductCategories, setHiddenProductCategories] = useState<
    string[]
  >([]);
  const [category, setCategory] = useState<{
    id?: string;
    version?: number;
    nameEn: string;
    nameFr: string;
  } | null>(null);
  const [product, setProduct] = useState<ProductInput | null>(null),
    [companyName, setCompanyName] = useState<string | null>(null),
    [agent, setAgent] = useState<AgentInput | null>(null),
    [store, setStore] = useState<StoreInput | null>(null),
    [order, setOrder] = useState<Order | null>(null),
    [deleteTarget, setDeleteTarget] = useState<Order | null>(null),
    [deleteAccount, setDeleteAccount] = useState<{
      kind: "agent" | "company";
      id: string;
      name: string;
    } | null>(null),
    [receipt, setReceipt] = useState<Order | null>(null);
  async function refresh() {
    const d = await request<Data>("/api/admin");
    setData(d);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (tab === "categories") refresh().catch((e) => setError(e.message));
  }, [tab]);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/api/admin", body);
      await refresh();
      setNotice("Changes saved.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const match = (...values: string[]) =>
    values.join(" ").toLowerCase().includes(search.toLowerCase());
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 2_097_152) throw new Error("Choose an image under 2 MB");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await request<{ image: string }>("/api/admin", {
        action: "uploadImage",
        contentBase64: base64,
      });
      setProduct((p) => (p ? { ...p, image: result.image } : p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function changeLine(id: string, qty: number) {
    setOrder((old) => {
      if (!old) return old;
      const lines = old.lines.map((l) =>
        l.id === id
          ? {
              ...l,
              qty,
              ...snapshotAmounts(
                l.dealerUnit,
                l.srpUnit,
                qty * l.unitsPerOrder,
              ),
            }
          : l,
      );
      return {
        ...old,
        lines,
        totalDealer: sumMoney(lines.map((l) => l.lineDealer)),
        totalRetail: sumMoney(lines.map((l) => l.lineRetail)),
      };
    });
  }
  const filteredProducts = (data?.products ?? []).filter(
    (p) =>
      !hiddenProductCategories.includes(p.category) &&
      match(p.name, p.sku, p.category),
  );
  const modalError = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );
  return (
    <main className="admin-layout">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your business, at a glance</span>
          <h1>Wholesale workspace</h1>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => refresh().catch((e) => setError(e.message))}
        >
          Refresh
        </button>
      </div>
      {error &&
        !category &&
        !product &&
        !agent &&
        !store &&
        !order &&
        !deleteTarget &&
        !deleteAccount &&
        modalError}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error ? "Unable to load workspace." : "Loading workspace…"}
        </p>
      ) : (
        <>
          <div className="stats">
            <div className="card">
              <small>Active orders</small>
              <strong>{data.orders.filter((o) => !o.cancelled).length}</strong>
            </div>
            <div className="card">
              <small>Order value</small>
              <strong>
                {money(
                  sumMoney(
                    data.orders
                      .filter((o) => !o.cancelled)
                      .map((o) => o.totalDealer),
                  ),
                )}
              </strong>
            </div>
            <div className="card">
              <small>Catalog products</small>
              <strong>{data.products.length}</strong>
            </div>
            <div className="card">
              <small>Agents / stores</small>
              <strong>
                {data.agents.length} / {data.stores.length}
              </strong>
            </div>
          </div>
          {data.notifications.some(
            (n) => n.state !== "sent" && n.count > 0,
          ) && (
            <p className="notice">
              Email queue:{" "}
              {data.notifications
                .filter((n) => n.state !== "sent")
                .map((n) => `${n.count} ${n.state}`)
                .join(" · ")}
              . Orders are saved independently of email delivery.
            </p>
          )}
          <div className="toolbar">
            <nav className="tabs" aria-label="Admin sections">
              {(
                [
                  "orders",
                  "products",
                  "categories",
                  "agents",
                  "stores",
                ] as const
              ).map((t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => {
                    setTab(t);
                    setSearch("");
                    setError("");
                  }}
                >
                  {t === "agents"
                    ? "Companies & agents"
                    : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </nav>
            <input
              aria-label={`Search ${tab}`}
              placeholder={`Search ${tab}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {tab === "categories" && (
            <>
              <div className="list-heading">
                <p className="muted">
                  Manage category names in English and French. Renaming a
                  category updates its products.
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setCategory({ nameEn: "", nameFr: "" });
                  }}
                >
                  + Add category
                </button>
              </div>
              <div className="card table-scroll">
                <table className="categories-table">
                  <thead>
                    <tr>
                      <th>English</th>
                      <th>French</th>
                      <th title="Number of products assigned to this category, including archived products">
                        Products
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories
                      .filter((c) => match(c.nameEn, c.nameFr))
                      .map((c) => (
                        <tr key={c.id}>
                          <td>{c.nameEn}</td>
                          <td>{c.nameFr}</td>
                          <td>{c.productCount}</td>
                          <td>
                            <div className="category-row-actions">
                              <button
                                className="secondary compact"
                                onClick={() => {
                                  setError("");
                                  setCategory(c);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-button danger agent-delete"
                                disabled={busy || c.productCount > 0}
                                aria-label={`Delete category ${c.nameEn}`}
                                title={
                                  c.productCount > 0
                                    ? "Categories used by products cannot be deleted"
                                    : "Delete category"
                                }
                                onClick={async () => {
                                  if (confirm(`Delete category ${c.nameEn}?`))
                                    await mutate({
                                      action: "deleteCategory",
                                      id: c.id,
                                      version: c.version,
                                    });
                                }}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.categories.length && (
                  <p className="empty">
                    Add a category before creating products.
                  </p>
                )}
              </div>
            </>
          )}
          {tab === "products" && (
            <>
              <div className="list-heading">
                <p className="muted">
                  Manage pricing, packs and agent-specific access.
                </p>
                <button
                  onClick={() => {
                    setError("");
                    setProduct({
                      ...blankProduct,
                      category: data.categories[0]?.nameEn ?? "",
                    });
                  }}
                >
                  + Add product
                </button>
              </div>
              <div className="catalog-view-toolbar">
                <CategoryFilter
                  categories={data.categories.map((c) => c.nameEn)}
                  excluded={hiddenProductCategories}
                  onChange={setHiddenProductCategories}
                />
              </div>
              <div className="card table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Cost / Dealer / SRP</th>
                      <th>Availability</th>
                      <th>Access</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="product-info">
                            <img src={p.image || "/images/image1.png"} alt="" />
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {p.sku} · {p.unitsPerOrder} {p.unitLabel}/
                                {p.orderUnit}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td>
                          {p.cost == null ? "—" : money(p.cost)} /{" "}
                          {money(dealerPrice(p))} / {money(p.srp)}
                        </td>
                        <td>
                          <span
                            className={`badge ${p.status === "available" ? "green" : ""}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td>
                          {p.agentCodes.length
                            ? p.agentCodes.join(", ")
                            : "All agents"}
                        </td>
                        <td>
                          <button
                            className="secondary compact"
                            onClick={() => {
                              setError("");
                              setProduct({ ...p });
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.products.length > 0 && !filteredProducts.length && (
                  <p className="empty">
                    No products match your search or selected categories.
                  </p>
                )}
                {!data.products.length && (
                  <p className="empty">
                    No products yet. Add a product or import your sheet export.
                  </p>
                )}
              </div>
            </>
          )}
          {tab === "agents" && (
            <>
              <div className="company-toolbar">
                <div>
                  <h2>Companies & agents</h2>
                  <p className="muted">
                    Each access code belongs to one agent within a company.
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setCompanyName("");
                    }}
                  >
                    + Add company
                  </button>
                  <button
                    onClick={() => {
                      setError("");
                      setAgent({
                        company: "",
                        code: crypto
                          .randomUUID()
                          .replaceAll("-", "")
                          .slice(0, 16)
                          .toUpperCase(),
                        firstName: "",
                        lastName: "",
                        email: "",
                        active: true,
                      });
                    }}
                  >
                    + Add agent
                  </button>
                </div>
              </div>
              {data.companies
                .map((c) => c.name)
                .map((company) => (
                  <section key={company} className="card category company-card">
                    <div className="company-header">
                      <div className="company-title">
                        <span className="company-monogram" aria-hidden="true">
                          {company
                            .split(/\s+/)
                            .map((word) => word[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <h2>{company}</h2>
                          <p>
                            {
                              data.agents.filter((a) => a.company === company)
                                .length
                            }{" "}
                            {data.agents.filter((a) => a.company === company)
                              .length === 1
                              ? "agent"
                              : "agents"}
                          </p>
                        </div>
                      </div>
                      <button
                        className="text-button danger company-delete"
                        disabled={busy}
                        aria-label={`Delete company ${company}`}
                        title="Delete company"
                        onClick={() => {
                          setError("");
                          setDeleteAccount({
                            kind: "company",
                            id: data.companies.find((c) => c.name === company)!
                              .id,
                            name: company,
                          });
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    {!data.agents.some((a) => a.company === company) && (
                      <p className="empty">
                        No agents yet. Use Add agent and choose this company.
                      </p>
                    )}
                    <div className="table-scroll">
                      <table className="agents-table">
                        <thead>
                          <tr>
                            <th>Agent</th>
                            <th>Email</th>
                            <th>Access code</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.agents
                            .filter(
                              (a) =>
                                a.company === company &&
                                match(
                                  a.company,
                                  a.code,
                                  a.firstName,
                                  a.lastName,
                                  a.email,
                                ),
                            )
                            .map((a) => (
                              <tr key={a.id}>
                                <td className="agent-name">
                                  {a.firstName} {a.lastName}
                                </td>
                                <td className="agent-email">
                                  {a.email || "—"}
                                </td>
                                <td>
                                  <code className="agent-code">{a.code}</code>
                                </td>
                                <td>
                                  <span
                                    className={`agent-status ${a.active ? "is-active" : ""}`}
                                  >
                                    <span aria-hidden="true" />
                                    {a.active ? "Active" : "Disabled"}
                                  </span>
                                </td>
                                <td>
                                  <div className="actions agent-actions">
                                    <button
                                      className="secondary compact"
                                      onClick={() => {
                                        setError("");
                                        setAgent({ ...a });
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="secondary compact"
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(
                                            `${location.origin}/?vendor=${encodeURIComponent(a.code)}`,
                                          );
                                          setNotice("Agent link copied.");
                                        } catch {
                                          setError("Could not copy the link.");
                                        }
                                      }}
                                    >
                                      Copy link
                                    </button>
                                    <a
                                      className="agent-open"
                                      target="_blank"
                                      rel="noreferrer"
                                      href={`/?vendor=${encodeURIComponent(a.code)}`}
                                    >
                                      Open ↗
                                    </a>
                                    <button
                                      className="text-button danger agent-delete"
                                      disabled={busy}
                                      aria-label={`Delete agent ${a.code}`}
                                      title="Delete agent"
                                      onClick={() => {
                                        setError("");
                                        setDeleteAccount({
                                          kind: "agent",
                                          id: a.id,
                                          name: `${a.firstName} ${a.lastName} (${a.code})`,
                                        });
                                      }}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              {!data.companies.length && (
                <p className="empty card">
                  No companies yet. Add a company, then its agents.
                </p>
              )}
            </>
          )}
          {tab === "stores" && (
            <>
              <div className="list-heading">
                <p className="muted">
                  Each store belongs to one agent. An agent can manage multiple
                  stores. Canadian Tire Store Numbers are unique within each
                  agent.
                </p>
                <button
                  disabled={busy || !data.agents.some((a) => a.active)}
                  onClick={() => {
                    setError("");
                    const first = data.agents.find((a) => a.active);
                    if (first)
                      setStore({
                        vendorCode: first.code,
                        company: first.company,
                        storeCode: "",
                        firstName: "",
                        lastName: "",
                        email: "",
                      });
                  }}
                >
                  + Add store
                </button>
              </div>
              <div className="card table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company / agent</th>
                      <th>Store</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.stores
                      .filter((s) =>
                        match(
                          s.company,
                          s.vendorCode,
                          data.agents.find((a) => a.code === s.vendorCode)
                            ?.firstName ?? "",
                          data.agents.find((a) => a.code === s.vendorCode)
                            ?.lastName ?? "",
                          s.storeCode,
                          s.firstName,
                          s.lastName,
                          s.email,
                        ),
                      )
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            {s.company}
                            <small>
                              {data.agents
                                .filter((a) => a.code === s.vendorCode)
                                .map((a) => `${a.firstName} ${a.lastName}`)
                                .join("") || "Unknown agent"}{" "}
                              ({s.vendorCode})
                            </small>
                          </td>
                          <td>{s.storeCode}</td>
                          <td>
                            {s.firstName} {s.lastName}
                          </td>
                          <td>{s.email}</td>
                          <td>
                            <button
                              className="secondary compact"
                              onClick={() => {
                                setError("");
                                setStore({ ...s });
                              }}
                            >
                              Edit
                            </button>
                            <a
                              className="agent-open"
                              href={`/?vendor=${encodeURIComponent(s.vendorCode)}&store=${encodeURIComponent(s.storeCode)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open ordering page for store ${s.storeCode}`}
                            >
                              Open ↗
                            </a>
                            <button
                              className="secondary compact danger"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Deactivate store ${s.storeCode}? It will be removed from active stores. Historical orders will be preserved.`,
                                  )
                                )
                                  await mutate({
                                    action: "deleteStore",
                                    id: s.id,
                                  });
                              }}
                            >
                              Deactivate store
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.stores.length && (
                  <p className="empty">No registered stores yet.</p>
                )}
              </div>
            </>
          )}
          {tab === "orders" && (
            <>
              <div className="list-heading">
                <p className="muted">
                  Latest 500 orders, grouped by company. Historical prices are
                  preserved.
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={cancelled}
                    onChange={(e) => setCancelled(e.target.checked)}
                  />
                  Show cancelled
                </label>
              </div>
              {[
                ...new Set(
                  data.orders
                    .filter(
                      (o) =>
                        (cancelled || !o.cancelled) &&
                        match(
                          o.reference,
                          o.company,
                          o.storeCode,
                          o.agentName,
                          o.contactName,
                        ),
                    )
                    .map((o) => o.company),
                ),
              ].map((company) => (
                <section className="card category" key={company}>
                  <h2>{company}</h2>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Store / agent</th>
                          <th>Total</th>
                          <th>Progress</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders
                          .filter(
                            (o) =>
                              o.company === company &&
                              (cancelled || !o.cancelled) &&
                              match(
                                o.reference,
                                o.company,
                                o.storeCode,
                                o.agentName,
                                o.contactName,
                              ),
                          )
                          .map((o) => (
                            <tr key={o.id}>
                              <td>
                                <strong>{o.reference}</strong>
                                <small>
                                  {new Date(o.date).toLocaleString("en-CA", {
                                    timeZone: "America/Toronto",
                                  })}
                                </small>
                              </td>
                              <td>
                                {o.storeCode}
                                <small>{o.agentName}</small>
                              </td>
                              <td>{money(o.totalDealer)}</td>
                              <td>
                                <div className="status-flags">
                                  {o.cancelled ? (
                                    <span className="badge">Cancelled</span>
                                  ) : (
                                    <>
                                      {o.orderSent && (
                                        <span className="badge green">
                                          Order sent
                                        </span>
                                      )}
                                      {o.invoiceSent && (
                                        <span className="badge green">
                                          Invoiced
                                        </span>
                                      )}
                                      {o.paymentReceived && (
                                        <span className="badge green">
                                          Paid
                                        </span>
                                      )}
                                      {!o.orderSent &&
                                        !o.invoiceSent &&
                                        !o.paymentReceived && (
                                          <span className="badge">New</span>
                                        )}
                                    </>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="actions">
                                  <button
                                    className="secondary compact"
                                    onClick={() => {
                                      setError("");
                                      setOrder(structuredClone(o));
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="secondary compact"
                                    onClick={() => setReceipt(o)}
                                  >
                                    View
                                  </button>
                                  <button
                                    className="text-button"
                                    onClick={() => exportOrder(o)}
                                  >
                                    CSV
                                  </button>
                                  <button
                                    className="text-button danger"
                                    aria-label={`Delete order ${o.reference}`}
                                    title="Delete order"
                                    disabled={busy}
                                    onClick={() => {
                                      setError("");
                                      setDeleteTarget(o);
                                    }}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      aria-hidden="true"
                                    >
                                      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              {!data.orders.length && (
                <p className="empty card">
                  No orders yet. Orders appear here as soon as customers submit
                  them.
                </p>
              )}
            </>
          )}
        </>
      )}
      {deleteAccount && (
        <Modal
          title={`Delete ${deleteAccount.kind}?`}
          onClose={() => {
            if (!busy) setDeleteAccount(null);
          }}
        >
          <p>
            <strong>{deleteAccount.name}</strong>
          </p>
          <p>
            {deleteAccount.kind === "agent"
              ? "This permanently deletes the agent and its stores. Its access link will stop working. Past orders and products are preserved."
              : "This permanently deletes the company. Remove or reassign its agents and products first. Past orders are preserved."}
          </p>
          {modalError}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeleteAccount(null)}
            >
              Keep {deleteAccount.kind}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate({
                    action:
                      deleteAccount.kind === "agent"
                        ? "deleteAgent"
                        : "deleteCompany",
                    id: deleteAccount.id,
                  })
                ) {
                  setNotice(
                    `${deleteAccount.kind === "agent" ? "Agent" : "Company"} deleted.`,
                  );
                  setDeleteAccount(null);
                }
              }}
            >
              {busy ? "Deleting…" : `Delete ${deleteAccount.kind}`}
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title={`Delete ${deleteTarget.reference}?`}
          onClose={() => {
            if (!busy) setDeleteTarget(null);
          }}
        >
          <p>
            {deleteTarget.company} · Store {deleteTarget.storeCode} ·{" "}
            {money(deleteTarget.totalDealer)}
          </p>
          <p>
            This permanently deletes the order, its items and queued emails.
            Emails already sent cannot be recalled. This cannot be undone.
          </p>
          {modalError}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              Keep order
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate({
                    action: "deleteOrder",
                    id: deleteTarget.id,
                    version: deleteTarget.version,
                  })
                ) {
                  setDeleteTarget(null);
                  setNotice("Order deleted.");
                }
              }}
            >
              {busy ? "Deleting…" : "Delete order"}
            </button>
          </div>
        </Modal>
      )}
      {category && (
        <Modal
          title={category.id ? "Edit category" : "Add category"}
          onClose={() => {
            if (!busy) setCategory(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "saveCategory", data: category }))
                setCategory(null);
            }}
          >
            {modalError}
            <label>
              English name
              <input
                required
                maxLength={100}
                value={category.nameEn}
                onChange={(e) =>
                  setCategory({ ...category, nameEn: e.target.value })
                }
              />
            </label>
            <label>
              French name
              <input
                required
                maxLength={100}
                lang="fr"
                value={category.nameFr}
                onChange={(e) =>
                  setCategory({ ...category, nameFr: e.target.value })
                }
              />
            </label>
            <button disabled={busy}>
              {busy ? "Saving…" : "Save category"}
            </button>
          </form>
        </Modal>
      )}
      {product && (
        <Modal
          title={product.id ? "Edit product" : "Add product"}
          onClose={() => {
            if (!busy) setProduct(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "saveProduct", data: product }))
                setProduct(null);
            }}
          >
            {modalError}
            <div className="form-grid">
              <label className="span-2">
                Product name
                <input
                  required
                  maxLength={200}
                  value={product.name}
                  onChange={(e) =>
                    setProduct({ ...product, name: e.target.value })
                  }
                />
              </label>
              {(["sku", "barcode", "style"] as const).map((key) => (
                <label key={key}>
                  {
                    {
                      sku: "SKU",
                      barcode: "Barcode",
                      category: "Category",
                      style: "Style",
                    }[key]
                  }
                  <input
                    value={product[key] ?? ""}
                    onChange={(e) =>
                      setProduct({ ...product, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Category
                <select
                  required
                  value={product.category}
                  onChange={(e) =>
                    setProduct({ ...product, category: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {data?.categories.map((c) => (
                    <option key={c.id} value={c.nameEn}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              </label>
              {(["cost", "srp"] as const).map((key) => (
                <label key={key}>
                  {key === "cost" ? "Cost per unit" : "SRP per unit"}
                  <input
                    type="number"
                    required={key === "srp" || product.dealerPrice == null}
                    min="0"
                    max="999999"
                    step="0.0001"
                    value={product[key] ?? ""}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        [key]:
                          key === "cost" && e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Published dealer price (optional)
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={product.dealerPrice ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      dealerPrice:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Minimum order quantity
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={product.minimumOrder ?? 1}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      minimumOrder: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Company restriction
                <select
                  value={product.companyId ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      companyId: e.target.value || null,
                    })
                  }
                >
                  <option value="">All companies</option>
                  {data?.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="notice span-2">
                Dealer price:{" "}
                {product.cost == null && product.dealerPrice == null
                  ? "Missing"
                  : money(dealerPrice(product))}{" "}
                per unit
              </p>
              <label>
                Order unit
                <input
                  required
                  value={product.orderUnit}
                  onChange={(e) =>
                    setProduct({ ...product, orderUnit: e.target.value })
                  }
                />
              </label>
              <label>
                Units per order
                <input
                  type="number"
                  required
                  min="1"
                  max="100000"
                  value={product.unitsPerOrder}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      unitsPerOrder: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Unit label
                <input
                  required
                  value={product.unitLabel}
                  onChange={(e) =>
                    setProduct({ ...product, unitLabel: e.target.value })
                  }
                />
              </label>
              <label>
                Availability
                <select
                  value={product.status}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      status: e.target.value as Product["status"],
                    })
                  }
                >
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
              <label className="span-2">
                Description
                <textarea
                  value={product.description}
                  maxLength={4000}
                  onChange={(e) =>
                    setProduct({ ...product, description: e.target.value })
                  }
                />
              </label>
              <fieldset className="span-2">
                <legend>Agent access — none selected means all agents</legend>
                <div className="agent-options">
                  {data?.agents.map((a) => (
                    <label className="checkbox" key={a.id}>
                      <input
                        type="checkbox"
                        checked={product.agentCodes.includes(a.code)}
                        onChange={(e) =>
                          setProduct({
                            ...product,
                            agentCodes: e.target.checked
                              ? [...product.agentCodes, a.code]
                              : product.agentCodes.filter((c) => c !== a.code),
                          })
                        }
                      />
                      {a.company} · {a.firstName} {a.lastName} ({a.code})
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="span-2">
                Product page image (PNG, JPEG, WebP or GIF, up to 2 MB)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void upload(e.target.files[0]);
                  }}
                />
              </label>
              <p className="muted span-2">
                New product pages use the entire uploaded image as the clickable
                area to add one ordering pack or case to the cart.
              </p>
              {product.image && (
                <img
                  className="edit-image"
                  alt="Product preview"
                  src={product.image}
                />
              )}
            </div>
            <div className="actions">
              <button disabled={busy}>
                {busy ? "Saving…" : "Save product"}
              </button>
              {product.id && (
                <button
                  type="button"
                  className="danger secondary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      confirm(
                        "Archive this product? Historical orders will be preserved.",
                      ) &&
                      (await mutate({
                        action: "deleteProduct",
                        id: product.id,
                      }))
                    )
                      setProduct(null);
                  }}
                >
                  Archive product
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {companyName !== null && (
        <Modal
          title="Add company"
          onClose={() => {
            if (!busy) setCompanyName(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate({
                  action: "saveCompany",
                  data: { name: companyName },
                })
              )
                setCompanyName(null);
            }}
          >
            {modalError}
            <label>
              Company name
              <input
                required
                maxLength={200}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
            <button disabled={busy}>{busy ? "Saving…" : "Save company"}</button>
          </form>
        </Modal>
      )}
      {agent && (
        <Modal
          title={agent.id ? "Edit agent" : "Add company agent"}
          onClose={() => {
            if (!busy) setAgent(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "saveAgent", data: agent }))
                setAgent(null);
            }}
          >
            {modalError}
            <label>
              Company
              <input
                required
                list="company-names"
                value={agent.company}
                onChange={(e) =>
                  setAgent({ ...agent, company: e.target.value })
                }
              />
              <datalist id="company-names">
                {(data?.companies || [])
                  .map((company) => company.name)
                  .map((c) => (
                    <option key={c} value={c} />
                  ))}
              </datalist>
            </label>
            <div className="form-grid">
              {(["firstName", "lastName"] as const).map((k) => (
                <label key={k}>
                  {k === "firstName" ? "First name" : "Last name"}
                  <input
                    value={agent[k]}
                    onChange={(e) =>
                      setAgent({ ...agent, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Email
              <input
                type="email"
                value={agent.email}
                onChange={(e) => setAgent({ ...agent, email: e.target.value })}
              />
            </label>
            <label>
              Access code
              <input
                required
                minLength={3}
                maxLength={64}
                pattern="[a-zA-Z0-9_-]+"
                value={agent.code}
                onChange={(e) =>
                  setAgent({ ...agent, code: e.target.value.toUpperCase() })
                }
              />
            </label>
            <p className="muted">
              Changing this code invalidates the old ordering link.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={agent.active}
                onChange={(e) =>
                  setAgent({ ...agent, active: e.target.checked })
                }
              />
              Active agent
            </label>
            <button disabled={busy}>{busy ? "Saving…" : "Save agent"}</button>
          </form>
        </Modal>
      )}
      {store && (
        <Modal
          title={store.id ? `Edit store ${store.storeCode}` : "Add store"}
          onClose={() => {
            if (!busy) setStore(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "saveStore", data: store }))
                setStore(null);
            }}
          >
            {modalError}
            {store.id ? (
              <p>
                {store.company} · Agent code {store.vendorCode}
              </p>
            ) : (
              <label>
                Company / agent
                <select
                  required
                  value={store.vendorCode}
                  onChange={(e) => {
                    const selected = data?.agents.find(
                      (a) => a.code === e.target.value,
                    );
                    if (selected)
                      setStore({
                        ...store,
                        vendorCode: selected.code,
                        company: selected.company,
                      });
                  }}
                >
                  {data?.agents
                    .filter((a) => a.active)
                    .map((a) => (
                      <option key={a.id} value={a.code}>
                        {a.company} · {a.firstName} {a.lastName} ({a.code})
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Canadian Tire Store Number
              <input
                required
                maxLength={64}
                pattern="[a-zA-Z0-9_-]+"
                value={store.storeCode}
                onChange={(e) =>
                  setStore({ ...store, storeCode: e.target.value })
                }
              />
            </label>
            {(["firstName", "lastName", "email"] as const).map((k) => (
              <label key={k}>
                {k === "firstName"
                  ? "First name"
                  : k === "lastName"
                    ? "Last name"
                    : "Email"}
                <input
                  required
                  type={k === "email" ? "email" : "text"}
                  value={store[k]}
                  onChange={(e) => setStore({ ...store, [k]: e.target.value })}
                />
              </label>
            ))}
            <div className="actions">
              <button disabled={busy}>{busy ? "Saving…" : "Save store"}</button>
              {store.id && (
                <button
                  type="button"
                  disabled={busy}
                  className="secondary danger"
                  onClick={async () => {
                    if (
                      confirm(
                        "Deactivate this store? Historical orders will be preserved.",
                      ) &&
                      (await mutate({ action: "deleteStore", id: store.id }))
                    )
                      setStore(null);
                  }}
                >
                  Deactivate store
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {order && (
        <Modal
          title={`Edit ${order.reference}`}
          onClose={() => {
            if (!busy) setOrder(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate({
                  action: "editOrder",
                  data: {
                    id: order.id,
                    version: order.version,
                    comments: order.comments,
                    customerPo: order.customerPo,
                    contactPhone: order.contactPhone,
                    orderSent: order.orderSent,
                    invoiceSent: order.invoiceSent,
                    paymentReceived: order.paymentReceived,
                    cancelled: order.cancelled,
                    lines: order.lines.map((l) => ({ id: l.id, qty: l.qty })),
                  },
                })
              )
                setOrder(null);
            }}
          >
            {modalError}
            <p>
              {order.company} · Store {order.storeCode} · {order.contactName}
            </p>
            {order.lines.map((l) => (
              <div className="edit-order-line" key={l.id}>
                <span>
                  {l.name}
                  <small>
                    {l.unitsPerOrder} {l.unitLabel}/{l.orderUnit}
                  </small>
                </span>
                <input
                  aria-label={`Quantity for ${l.name}`}
                  className="quantity"
                  type="number"
                  min={l.minimumOrder ?? 1}
                  max="100000"
                  required
                  value={l.qty}
                  onChange={(e) =>
                    changeLine(
                      l.id,
                      Math.max(
                        l.minimumOrder ?? 1,
                        Math.floor(Number(e.target.value) || 1),
                      ),
                    )
                  }
                />
                <strong>{money(l.lineDealer)}</strong>
                <button
                  type="button"
                  disabled={order.lines.length === 1}
                  className="text-button danger"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => {
                    const lines = order.lines.filter((x) => x.id !== l.id);
                    setOrder({
                      ...order,
                      lines,
                      totalDealer: sumMoney(lines.map((x) => x.lineDealer)),
                      totalRetail: sumMoney(lines.map((x) => x.lineRetail)),
                    });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="receipt-total">
              Dealer total <strong>{money(order.totalDealer)}</strong>
            </div>
            <div className="status-flags">
              {(
                [
                  "orderSent",
                  "invoiceSent",
                  "paymentReceived",
                  "cancelled",
                ] as const
              ).map((k) => (
                <label key={k} className="checkbox">
                  <input
                    type="checkbox"
                    checked={order[k]}
                    onChange={(e) =>
                      setOrder({ ...order, [k]: e.target.checked })
                    }
                  />
                  {
                    {
                      orderSent: "Order sent",
                      invoiceSent: "Invoice sent",
                      paymentReceived: "Payment received",
                      cancelled: "Cancelled",
                    }[k]
                  }
                </label>
              ))}
            </div>
            <label>
              PO number (optional)
              <input
                maxLength={200}
                value={order.customerPo ?? ""}
                onChange={(e) =>
                  setOrder({ ...order, customerPo: e.target.value })
                }
              />
            </label>
            <label>
              Phone (optional)
              <input
                type="tel"
                maxLength={80}
                value={order.contactPhone ?? ""}
                onChange={(e) =>
                  setOrder({ ...order, contactPhone: e.target.value })
                }
              />
            </label>
            <label>
              Comments
              <textarea
                maxLength={4000}
                value={order.comments}
                onChange={(e) =>
                  setOrder({ ...order, comments: e.target.value })
                }
              />
            </label>
            <button disabled={busy}>{busy ? "Saving…" : "Save order"}</button>
          </form>
        </Modal>
      )}
      {receipt && (
        <Modal title="Order details" onClose={() => setReceipt(null)}>
          <OrderReceipt order={receipt} />
        </Modal>
      )}
    </main>
  );
}
function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </svg>
  );
}
