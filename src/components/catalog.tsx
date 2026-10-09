"use client";
import { useLanguage } from "./language";
import { useEffect, useState } from "react";
import {
  productAmounts,
  dealerPrice,
  sumMoney,
  type Agent,
  type Product,
  type Store,
  type Order,
} from "@/lib/domain";
import { Modal, OrderReceipt, request } from "./shared";
import { PdfCatalog } from "./pdf-catalog";
export function Catalog({ code }: { code: string }) {
  const { t, money } = useLanguage();
  const [agent, setAgent] = useState<Agent | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [invalid, setInvalid] = useState(false),
    [error, setError] = useState("");
  const [store, setStore] = useState<Store | null>(null),
    [storeCode, setStoreCode] = useState(""),
    [candidate, setCandidate] = useState<Store | null>(null),
    [step, setStep] = useState<"lookup" | "confirm" | "register">("lookup");
  const [contact, setContact] = useState({
      firstName: "",
      lastName: "",
      email: "",
    }),
    [busy, setBusy] = useState(false),
    [qty, setQty] = useState<Record<string, number>>({}),
    [comments, setComments] = useState(""),
    [customerPo, setCustomerPo] = useState(""),
    [contactPhone, setContactPhone] = useState(""),
    [review, setReview] = useState(false),
    [receipt, setReceipt] = useState<Order | null>(null),
    [search, setSearch] = useState(""),
    [lightbox, setLightbox] = useState<Product | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const draftKey = `tn-draft-${code.toUpperCase()}`;
  useEffect(() => {
    let active = true;
    request<{ agent: Agent; products: Product[] }>(
      `/api/catalog?vendor=${encodeURIComponent(code)}`,
    )
      .then((d) => {
        if (active) {
          setAgent(d.agent);
          setProducts(d.products);
        }
      })
      .catch((e) => {
        if (active) {
          if (e.status === 404 || e.status === 400) setInvalid(true);
          else setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (saved) {
        setQty(saved.qty || {});
        setComments(saved.comments || "");
        setCustomerPo(saved.customerPo || "");
        setContactPhone(saved.contactPhone || "");
        setStoreCode(saved.storeCode || "");
      }
    } catch {}
    return () => {
      active = false;
    };
  }, [code, draftKey]);
  const lines = products
    .filter((p) => qty[p.id] > 0)
    .map((p) => ({
      p,
      qty: qty[p.id],
      ...productAmounts(p, qty[p.id] * p.unitsPerOrder),
    }));
  const total = sumMoney(lines.map((l) => l.lineDealer)),
    units = lines.reduce((s, l) => s + l.qty * l.p.unitsPerOrder, 0);
  useEffect(() => {
    if (!loading && !receipt)
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ qty, comments, customerPo, contactPhone, storeCode }),
      );
  }, [
    qty,
    comments,
    customerPo,
    contactPhone,
    storeCode,
    loading,
    receipt,
    draftKey,
  ]);
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await request<{ store: Store | null }>("/api/stores", {
        action: "lookup",
        vendorCode: code,
        storeCode,
      });
      setCandidate(d.store);
      setStep(d.store ? "confirm" : "register");
      if (!d.store) setContact({ firstName: "", lastName: "", email: "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await request<{ store: Store }>("/api/stores", {
        action: "save",
        store: { id: candidate?.id, vendorCode: code, storeCode, ...contact },
      });
      setStore(d.store);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        vendorCode: code.toUpperCase(),
        storeCode: store!.storeCode,
        comments,
        customerPo,
        contactPhone,
        lines: lines.map((l) => ({ productId: l.p.id, qty: l.qty })),
      };
      const signature = JSON.stringify(payload);
      const saved = JSON.parse(
        sessionStorage.getItem(`${draftKey}-submission`) || "null",
      );
      const idempotencyKey =
        saved?.signature === signature ? saved.key : crypto.randomUUID();
      sessionStorage.setItem(
        `${draftKey}-submission`,
        JSON.stringify({ signature, key: idempotencyKey }),
      );
      const d = await request<{ order: Order }>("/api/orders", {
        ...payload,
        idempotencyKey,
      });
      setReceipt(d.order);
      setReview(false);
      sessionStorage.removeItem(draftKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="access-card">
        <p role="status">{t("Loading your collection…")}</p>
      </main>
    );
  if (invalid)
    return (
      <main className="access-card">
        <span className="eyebrow">{t("Wholesale access")}</span>
        <h1>{t("Access required")}</h1>
        <p>{t("Please contact your vendor for a valid company-agent link.")}</p>
      </main>
    );
  if (!agent)
    return (
      <main className="access-card">
        <h1>{t("Unable to load the collection")}</h1>
        <p role="alert">{t(error)}</p>
        <button onClick={() => location.reload()}>{t("Try again")}</button>
      </main>
    );
  if (receipt)
    return (
      <main className="receipt-page">
        <div className="success no-print">
          {t("Your order has been recorded. Reference:")} {receipt.reference}
        </div>
        <OrderReceipt order={receipt} />
        <button
          className="no-print"
          onClick={() => {
            setReceipt(null);
            setQty({});
            setComments("");
            setCustomerPo("");
            setContactPhone("");
            sessionStorage.removeItem(`${draftKey}-submission`);
          }}
        >
          {t("Start another order")}
        </button>
      </main>
    );
  if (!store)
    return (
      <main className="store-page">
        <span className="eyebrow">{agent.company}</span>
        <h1>{t("Welcome to Terra Nova.")}</h1>
        <p className="muted">
          {t("Your agent:")}{" "}
          {[agent.firstName, agent.lastName].filter(Boolean).join(" ") ||
            agent.code}
        </p>
        <section className="card store-card">
          <h2>
            {step === "lookup"
              ? t("Let’s find your store")
              : step === "confirm"
                ? t("Is this your store?")
                : t("Create your store")}
          </h2>
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
          {step === "lookup" ? (
            <form onSubmit={lookup}>
              <label>
                {t("Canadian Tire Store Number")}
                <input
                  required
                  maxLength={64}
                  autoFocus
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                />
              </label>
              <p className="muted">
                {t(
                  "New here? Enter your Canadian Tire Store Number and we’ll help you register.",
                )}
              </p>
              <button disabled={busy}>
                {busy ? t("Looking up…") : t("Continue →")}
              </button>
            </form>
          ) : step === "confirm" && candidate ? (
            <>
              <p>
                <strong>{candidate.storeCode}</strong>
                <br />
                {candidate.firstName} {candidate.lastName}
                <br />
                {candidate.email}
              </p>
              <div className="actions">
                <button onClick={() => setStore(candidate)}>
                  {t("Yes, continue to catalog")}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setContact({
                      firstName: candidate.firstName,
                      lastName: candidate.lastName,
                      email: candidate.email,
                    });
                    setStep("register");
                  }}
                >
                  {t("Update details")}
                </button>
                <button
                  className="text-button"
                  onClick={() => setStep("lookup")}
                >
                  {t("Use another Canadian Tire Store Number")}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={register}>
              <p>
                {t("Store")} <strong>{storeCode}</strong>
              </p>
              <div className="form-grid">
                <label>
                  {t("First name")}
                  <input
                    required
                    value={contact.firstName}
                    onChange={(e) =>
                      setContact({ ...contact, firstName: e.target.value })
                    }
                  />
                </label>
                <label>
                  {t("Last name")}
                  <input
                    required
                    value={contact.lastName}
                    onChange={(e) =>
                      setContact({ ...contact, lastName: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                {t("Email")}
                <input
                  required
                  type="email"
                  value={contact.email}
                  onChange={(e) =>
                    setContact({ ...contact, email: e.target.value })
                  }
                />
              </label>
              <div className="actions">
                <button disabled={busy}>
                  {busy ? t("Saving…") : t("Save and view catalog")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep("lookup")}
                >
                  {t("Back")}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    );
  const availableCategories = [
    ...new Set(products.map((p) => p.category)),
  ].sort();
  const categoryProducts = products.filter(
    (p) => !hiddenCategories.includes(p.category),
  );
  const shown = categoryProducts.filter((p) =>
    `${t(p.name)} ${p.sku} ${t(p.category)} ${p.style}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const tableProducts = shown.filter((p) => !p.catalogKey);
  const categories = [...new Set(tableProducts.map((p) => p.category))];
  // Lightbox steps through products in the order the catalog displays them.
  const ordered = categories.flatMap((category) =>
    tableProducts.filter((p) => p.category === category),
  );
  const lightboxIndex = lightbox
    ? ordered.findIndex((p) => p.id === lightbox.id)
    : -1;
  function stepLightbox(delta: number) {
    if (!ordered.length) return;
    setLightbox(
      ordered[(lightboxIndex + delta + ordered.length) % ordered.length],
    );
  }
  function setProductQty(id: string, value: number) {
    setQty((current) => ({
      ...current,
      [id]: Math.min(100000, Math.max(0, value)),
    }));
  }
  function cartControl(p: Product, disabled = false) {
    if (p.status !== "available")
      return <span className="badge">{t("Unavailable")}</span>;
    if (!(qty[p.id] > 0))
      return (
        <button
          type="button"
          className="add-to-cart"
          disabled={disabled}
          aria-label={`${t("Add")} ${t(p.name)} ${t("to cart")}`}
          onClick={() => setProductQty(p.id, p.minimumOrder ?? 1)}
        >
          {t("Add to Cart")}
        </button>
      );
    return (
      <div
        className="cart-quantity"
        role="group"
        aria-label={`${t("Quantity for")} ${t(p.name)}`}
      >
        <button
          type="button"
          className="secondary"
          aria-label={`${t("Decrease quantity for")} ${t(p.name)}`}
          disabled={disabled}
          onClick={() =>
            setProductQty(
              p.id,
              qty[p.id] <= (p.minimumOrder ?? 1) ? 0 : qty[p.id] - 1,
            )
          }
        >
          −
        </button>
        <output aria-live="polite">{qty[p.id]}</output>
        <button
          type="button"
          className="secondary"
          aria-label={`${t("Increase quantity for")} ${t(p.name)}`}
          disabled={disabled || qty[p.id] >= 100000}
          onClick={() => setProductQty(p.id, qty[p.id] + 1)}
        >
          +
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="agent-strip">
        <strong>{agent.company}</strong>
        <span>
          {t("Agent:")}{" "}
          {[agent.firstName, agent.lastName].filter(Boolean).join(" ") ||
            agent.code}
        </span>
        <span>
          {t("Store")} {store.storeCode}
        </span>
        <button
          className="text-button"
          onClick={() => {
            setStore(null);
            setStep("lookup");
            setError("");
          }}
        >
          {t("Change store")}
        </button>
      </div>
      <main className="catalog-layout">
        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("The collection")}</span>
              <h1>{t("Stock your shelves.")}</h1>
              <p className="muted">
                {t(
                  "All prices per individual unit. Order by the pack, case or display.",
                )}
              </p>
            </div>
            <input
              aria-label={t("Search products")}
              placeholder={t("Search products or SKU…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <fieldset className="catalog-category-filter">
            <legend>{t("Browse by category")}</legend>
            <div className="catalog-category-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => setHiddenCategories([])}
              >
                {t("Select all")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setHiddenCategories(availableCategories)}
              >
                {t("Clear all")}
              </button>
            </div>
            <div className="catalog-category-options">
              {availableCategories.map((category) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={!hiddenCategories.includes(category)}
                    onChange={(e) =>
                      setHiddenCategories((current) =>
                        e.target.checked
                          ? current.filter((value) => value !== category)
                          : [...current, category],
                      )
                    }
                  />
                  {t(category)}
                </label>
              ))}
            </div>
          </fieldset>
          {!shown.length && (
            <div className="empty">
              {products.length
                ? t("No products match your search or selected categories.")
                : t(
                    "Your agent’s catalog is being prepared. Please contact your vendor.",
                  )}
            </div>
          )}
          <PdfCatalog
            products={categoryProducts}
            search={search}
            qty={qty}
            controls={cartControl}
            add={(p) =>
              setQty((current) => ({
                ...current,
                [p.id]: Math.min(
                  100000,
                  current[p.id] > 0 ? current[p.id] + 1 : (p.minimumOrder ?? 1),
                ),
              }))
            }
          />
          {categories.map((category) => (
            <section className="category card" key={category}>
              <h2>
                {t(category)}
                <span>
                  {tableProducts.filter((p) => p.category === category).length}{" "}
                  products
                </span>
              </h2>
              <div className="table-scroll">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th>{t("Product")}</th>
                      <th>{t("SRP")}</th>
                      <th>{t("Cost")}</th>
                      <th>{t("Dealer")}</th>
                      <th>{t("Order qty")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableProducts
                      .filter((p) => p.category === category)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="product-info">
                              <button
                                className="image-button"
                                onClick={() => setLightbox(p)}
                                aria-label={`View ${t(p.name)}`}
                              >
                                <img
                                  src={p.image || "/images/image1.png"}
                                  alt={t(p.name)}
                                />
                              </button>
                              <div>
                                <strong>{t(p.name)}</strong>
                                <small>
                                  {p.sku}
                                  {p.style && ` · ${p.style}`}
                                </small>
                                <small>
                                  1 {t(p.orderUnit)} = {p.unitsPerOrder}{" "}
                                  {t(p.unitLabel)}
                                </small>
                                {(p.minimumOrder ?? 1) > 1 && (
                                  <small>
                                    Minimum {p.minimumOrder} {t(p.orderUnit)}s
                                  </small>
                                )}
                                {p.description && (
                                  <small>{p.description}</small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>{money(p.srp)}</td>
                          <td>{p.cost == null ? "—" : money(p.cost)}</td>
                          <td>
                            <strong>{money(dealerPrice(p))}</strong>
                            <small>
                              {p.srp
                                ? (
                                    ((p.srp - dealerPrice(p)) / p.srp) *
                                    100
                                  ).toFixed(1)
                                : "—"}
                              % {t("margin")}
                            </small>
                          </td>
                          <td>{cartControl(p)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
        <aside className="card order-panel">
          <span className="eyebrow">{t("Your selection")}</span>
          <h2>{t("Order summary")}</h2>
          <p className="muted">
            {store.firstName} {store.lastName}
            <br />
            {t("Store")} {store.storeCode}
          </p>
          <div className="receipt-total">
            <span>
              {t("Dealer total")}
              <small>
                {units} {t("individual units")}
              </small>
            </span>
            <strong>{money(total)}</strong>
          </div>
          <label>
            {t("PO number (optional)")}
            <input
              maxLength={200}
              value={customerPo}
              onChange={(e) => setCustomerPo(e.target.value)}
            />
          </label>
          <label>
            {t("Phone (optional)")}
            <input
              type="tel"
              maxLength={80}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </label>
          <label>
            {t("Order notes")}
            <textarea
              rows={3}
              maxLength={4000}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={t("Anything we should know?")}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
          <button
            className="full"
            disabled={!lines.length}
            onClick={() => setReview(true)}
          >
            {t("Review order →")}
          </button>
          <h3 className="cart-items-heading">{t("Selected items")}</h3>
          {lines.length ? (
            lines.map((l) => (
              <div className="summary-line" key={l.p.id}>
                <span>
                  {t(l.p.name)}
                  {l.p.catalogKey === "row-19"
                    ? ` - ${t("Twin")}`
                    : l.p.catalogKey === "row-20"
                      ? ` - ${t("Queen")}`
                      : ""}
                  <small>
                    {l.qty} {t(l.p.orderUnit)} · {l.qty * l.p.unitsPerOrder}{" "}
                    {t(l.p.unitLabel)}
                  </small>
                </span>
                <div className="summary-actions">
                  <strong>{money(l.lineDealer)}</strong>
                  <button
                    type="button"
                    className="text-button danger remove-cart-item"
                    aria-label={`${t("Remove")} ${t(l.p.name)} ${t("from cart")}`}
                    title={t("Remove item")}
                    onClick={() =>
                      setQty((current) => ({ ...current, [l.p.id]: 0 }))
                    }
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="empty">{t("Choose products to start your order.")}</p>
          )}
        </aside>
      </main>
      {review && (
        <Modal
          title={t("Review your order")}
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <p>
            {agent.company} · {t("Store")} {store.storeCode}
            <br />
            {store.firstName} {store.lastName} · {store.email}
          </p>
          <table className="review-table">
            <thead>
              <tr>
                <th scope="col">{t("Product")}</th>
                <th scope="col">{t("Quantity")}</th>
                <th scope="col">{t("Delete")}</th>
                <th scope="col" className="review-price">
                  {t("Line total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.p.id}>
                  <td>
                    {t(l.p.name)}
                    {l.p.sku && <small>SKU: {l.p.sku}</small>}
                    <small>
                      {l.qty} {t(l.p.orderUnit)} · {l.qty * l.p.unitsPerOrder}{" "}
                      {t(l.p.unitLabel)}
                    </small>
                  </td>
                  <td>{cartControl(l.p, busy)}</td>
                  <td className="review-delete">
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy}
                      aria-label={`${t("Remove")} ${t(l.p.name)} ${t("from review")}`}
                      title={t("Remove item")}
                      onClick={() => setProductQty(l.p.id, 0)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                      </svg>
                    </button>
                  </td>
                  <td className="review-price">
                    <strong>{money(l.lineDealer)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lines.length && (
            <p className="empty" role="status">
              Your cart is empty. Close this review to add products.
            </p>
          )}
          <div className="receipt-total" aria-live="polite">
            {t("Total")} <strong>{money(total)}</strong>
          </div>
          {customerPo && <p>PO: {customerPo}</p>}
          {contactPhone && (
            <p>
              {t("Phone:")} {contactPhone}
            </p>
          )}
          {comments && <p>{comments}</p>}
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
          <p className="muted">
            {t("Your order will be recorded when you confirm.")}
          </p>
          <button disabled={busy || !lines.length} onClick={submit}>
            {busy ? t("Recording order…") : t("Confirm and submit order")}
          </button>
        </Modal>
      )}
      {lightbox && (
        <Modal title={t(lightbox.name)} onClose={() => setLightbox(null)}>
          <div
            className="lightbox"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") stepLightbox(-1);
              if (e.key === "ArrowRight") stepLightbox(1);
            }}
          >
            <div className="lightbox-stage">
              <button
                type="button"
                className="lightbox-nav"
                aria-label={t("Previous product")}
                disabled={ordered.length < 2}
                onClick={() => stepLightbox(-1)}
              >
                ‹
              </button>
              <img
                className="lightbox-image"
                src={lightbox.image || "/images/image1.png"}
                alt={t(lightbox.name)}
              />
              <button
                type="button"
                className="lightbox-nav"
                aria-label={t("Next product")}
                disabled={ordered.length < 2}
                onClick={() => stepLightbox(1)}
              >
                ›
              </button>
            </div>
            <div className="lightbox-details">
              <div>
                <small className="muted">
                  {lightbox.sku}
                  {lightbox.style && ` · ${lightbox.style}`} · 1{" "}
                  {t(lightbox.orderUnit)} = {lightbox.unitsPerOrder}{" "}
                  {t(lightbox.unitLabel)}
                </small>
                <p>
                  <strong>{money(dealerPrice(lightbox))}</strong>{" "}
                  <span className="muted">
                    dealer · SRP {money(lightbox.srp)}
                  </span>
                </p>
                {lightbox.description && <p>{lightbox.description}</p>}
              </div>
              {cartControl(lightbox)}
            </div>
            {lightboxIndex >= 0 && (
              <p className="lightbox-count muted">
                {lightboxIndex + 1} {t("of")} {ordered.length}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
