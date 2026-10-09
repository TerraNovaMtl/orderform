"use client";
import { useEffect, useState } from "react";
import pages from "@/lib/fma-pages.json";
import { dealerPrice, moneyFormat, type Product } from "@/lib/domain";
import { Modal } from "./shared";

export function PdfCatalog({
  products,
  search,
  qty,
  add,
  controls,
}: {
  products: Product[];
  search: string;
  qty: Record<string, number>;
  add: (product: Product) => void;
  controls: (product: Product) => React.ReactNode;
}) {
  const [message, setMessage] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [choices, setChoices] = useState<Product[] | null>(null);
  useEffect(() => {
    setPageNumber(1);
    setMessage("");
  }, [search]);
  const byKey = new Map(
    products.filter((p) => p.catalogKey).map((p) => [p.catalogKey, p]),
  );
  if (!byKey.size) return null;
  const matches = (p: Product) =>
    `${p.name} ${p.sku} ${p.category} ${p.style}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const visiblePages = pages.filter(
    (page) =>
      (!page.regions.length || page.regions.some((r) => byKey.has(r.key))) &&
      (!search ||
        page.regions.some((r) => {
          const p = byKey.get(r.key);
          return p && matches(p);
        })),
  );
  const pageIndex = Math.max(
    0,
    visiblePages.findIndex((page) => page.number === pageNumber),
  );
  const currentPage = visiblePages[pageIndex];
  if (!currentPage) return null;
  function select(p: Product) {
    add(p);
    setMessage(`${p.name} added to your cart.`);
  }
  return (
    <div className="pdf-catalog">
      <aside className="catalog-help" aria-label="How to order">
        <h3>Click the catalogue to order</h3>
        <ol>
          <li>
            <strong>Click anywhere on the page.</strong> Add one assorted pack
            or case to your cart. Colours and styles are selected by the
            shipper. Choose Twin or Queen for comforters.
          </li>
          <li>
            <strong>Need more?</strong> Click it again to add another pack or
            case.
          </li>
          <li>
            <strong>Browse the catalogue.</strong> Use the left and right arrows
            to turn pages.
          </li>
        </ol>
      </aside>
      {message && (
        <p role="status" className="pdf-cart-feedback">
          {message}
        </p>
      )}
      {(currentPage ? [currentPage] : []).map((page) => {
        const regions = page.regions.flatMap((region) => {
          const product = byKey.get(region.key);
          return product ? [{ ...region, product }] : [];
        });
        // Do not show a product page whose products are all hidden or restricted.
        if (page.regions.length && !regions.length) return null;
        return (
          <section
            className="card pdf-page-card"
            key={page.number}
            aria-label={`PDF page ${page.number}`}
          >
            <div
              className="pdf-reader-stage"
              style={{
                position: "relative",
                padding: "0 clamp(64px, 8vw, 94px)",
              }}
            >
              <button
                type="button"
                className="secondary pdf-turn pdf-turn-previous"
                aria-label="Previous catalogue page"
                disabled={pageIndex === 0}
                onClick={() =>
                  setPageNumber(visiblePages[pageIndex - 1].number)
                }
                style={{
                  position: "absolute",
                  left: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 2,
                  padding: "12px 6px",
                }}
              >
                <span className="pdf-turn-arrow" aria-hidden="true">
                  ←
                </span>
                <span>Back</span>
              </button>
              <button
                type="button"
                className="secondary pdf-turn pdf-turn-next"
                aria-label="Next catalogue page"
                disabled={pageIndex >= visiblePages.length - 1}
                onClick={() =>
                  setPageNumber(visiblePages[pageIndex + 1].number)
                }
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 2,
                  padding: "12px 6px",
                }}
              >
                <span>Next</span>
                <span className="pdf-turn-arrow" aria-hidden="true">
                  →
                </span>
              </button>
              {regions.length > 0 && (
                <div className="pdf-add-hint">Click image to add to cart</div>
              )}
              <div
                className="pdf-page-sheet"
                style={{
                  position: "relative",
                  width: `min(100%, ${(82 * page.width) / page.height}vh)`,
                  margin: "0 auto",
                  aspectRatio: `${page.width} / ${page.height}`,
                }}
              >
                <img
                  src={page.image}
                  alt={`Original Terra Nova catalogue page ${page.number}`}
                  loading="lazy"
                  width={page.width}
                  height={page.height}
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
                {regions.slice(0, 1).map(({ key, bounds, product }) => (
                  <button
                    key={key}
                    type="button"
                    className={`pdf-product-region${qty[product.id] > 0 ? " selected" : ""}`}
                    style={{
                      position: "absolute",
                      display: "block",
                      boxSizing: "border-box",
                      padding: 0,
                      margin: 0,
                      background: "transparent",
                      border:
                        qty[product.id] > 0
                          ? "2px solid #276653"
                          : "2px solid transparent",
                      cursor:
                        product.status === "available" ? "pointer" : "default",
                      zIndex: 1,
                      left: `${bounds[0] * 100}%`,
                      top: `${bounds[1] * 100}%`,
                      width: `${(bounds[2] - bounds[0]) * 100}%`,
                      height: `${(bounds[3] - bounds[1]) * 100}%`,
                    }}
                    disabled={
                      product.status !== "available" ||
                      qty[product.id] >= 100000
                    }
                    aria-label={
                      regions.length > 1
                        ? "Choose Twin or Queen comforter"
                        : `Add ${product.name} to cart`
                    }
                    title={`${product.name} · ${moneyFormat(dealerPrice(product))} per unit · ${product.unitsPerOrder} ${product.unitLabel} per ${product.orderUnit}`}
                    onClick={() =>
                      regions.length > 1
                        ? setChoices(regions.map((r) => r.product))
                        : select(product)
                    }
                  >
                    {qty[product.id] > 0 && (
                      <span>
                        {qty[product.id]} {product.orderUnit}
                        {qty[product.id] === 1 ? "" : "s"} in cart
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <nav
              className="pdf-page-navigation pdf-bottom-pages"
              aria-label="Catalogue pages"
            >
              <label>
                Page
                <select
                  aria-label="Catalogue page"
                  value={currentPage?.number ?? ""}
                  onChange={(e) => setPageNumber(Number(e.target.value))}
                >
                  {visiblePages.map((page) => (
                    <option key={page.number} value={page.number}>
                      {page.number}
                    </option>
                  ))}
                </select>
                <span>
                  of {pages.length}
                  {search ? ` · ${visiblePages.length} matching pages` : ""}
                </span>
              </label>
            </nav>
            {regions.length > 0 && (
              <details className="pdf-page-options" key={page.number}>
                <summary>Adjust quantities for this page</summary>
                {regions.map(({ key, product }) => (
                  <div className="pdf-page-option" key={key}>
                    <div>
                      <strong>
                        {product.name}
                        {product.catalogKey === "row-19"
                          ? " - Twin"
                          : product.catalogKey === "row-20"
                            ? " - Queen"
                            : ""}
                      </strong>
                      <small>
                        {product.sku} · 1 {product.orderUnit} ={" "}
                        {product.unitsPerOrder} {product.unitLabel}
                        {(product.minimumOrder ?? 1) > 1
                          ? ` · Minimum ${product.minimumOrder} packs`
                          : ""}
                      </small>
                      <small>
                        Dealer {moneyFormat(dealerPrice(product))} / unit ·
                        Retail {moneyFormat(product.srp)} / unit
                      </small>
                    </div>
                    {controls(product)}
                  </div>
                ))}
              </details>
            )}
          </section>
        );
      })}
      {choices && (
        <Modal title="Choose comforter size" onClose={() => setChoices(null)}>
          <div className="actions">
            {choices.map((p) => (
              <button
                key={p.id}
                disabled={p.status !== "available"}
                onClick={() => {
                  select(p);
                  setChoices(null);
                }}
              >
                {p.catalogKey === "row-19" ? "Twin" : "Queen"} ·{" "}
                {moneyFormat(dealerPrice(p) * p.unitsPerOrder)} per case
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
