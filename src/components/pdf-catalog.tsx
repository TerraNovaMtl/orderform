"use client";
import { useLanguage } from "./language";
import { useEffect, useState } from "react";
import { catalogPages, hasUploadedPage } from "@/lib/catalog-pages";
import { dealerPrice, type Product } from "@/lib/domain";
import { Modal } from "./shared";

export function PdfCatalog({
  products,
  allProducts,
  categoryFilterActive,
  search,
  qty,
  add,
  controls,
}: {
  products: Product[];
  allProducts: Product[];
  categoryFilterActive: boolean;
  search: string;
  qty: Record<string, number>;
  add: (product: Product) => void;
  controls: (product: Product) => React.ReactNode;
}) {
  const { t, money: moneyFormat } = useLanguage();
  const pages = catalogPages(allProducts);
  const [imageSizes, setImageSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [message, setMessage] = useState<Product | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [choices, setChoices] = useState<Product[] | null>(null);
  useEffect(() => {
    setPageNumber(1);
    setMessage(null);
  }, [search]);
  const byKey = new Map(
    products
      .filter((p) => p.catalogKey || hasUploadedPage(p))
      .map((p) => [p.catalogKey || p.id, p]),
  );
  if (!byKey.size) return null;
  const matches = (p: Product) =>
    `${t(p.name)} ${p.sku} ${t(p.category)} ${p.style}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const visiblePages = pages.filter(
    (page) =>
      (!categoryFilterActive || page.regions.length > 0) &&
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
    setMessage(p);
  }
  return (
    <div className="pdf-catalog">
      {message && (
        <p role="status" className="pdf-cart-feedback">
          {t(message.name)} {t("added to your cart.")}
        </p>
      )}
      {(currentPage ? [currentPage] : []).map((sourcePage) => {
        const page = { ...sourcePage, ...imageSizes[sourcePage.image] };
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
                aria-label={t("Previous catalogue page")}
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
                <span>{t("Back")}</span>
              </button>
              <button
                type="button"
                className="secondary pdf-turn pdf-turn-next"
                aria-label={t("Next catalogue page")}
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
                <span>{t("Next")}</span>
                <span className="pdf-turn-arrow" aria-hidden="true">
                  →
                </span>
              </button>
              {regions.length > 0 && (
                <div className="pdf-add-hint">
                  {t("Click image to add to cart")}
                </div>
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
                  onLoad={(e) => {
                    const { naturalWidth: width, naturalHeight: height } =
                      e.currentTarget;
                    if (width && height)
                      setImageSizes((current) => ({
                        ...current,
                        [page.image]: { width, height },
                      }));
                  }}
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
                        ? t("Choose Twin or Queen comforter")
                        : `${t("Add")} ${t(product.name)} ${t("to cart")}`
                    }
                    title={`${t(product.name)} · ${moneyFormat(dealerPrice(product))} ${t("per unit")} · ${product.unitsPerOrder} ${t(product.unitLabel)} / ${t(product.orderUnit)}`}
                    onClick={() =>
                      regions.length > 1
                        ? setChoices(regions.map((r) => r.product))
                        : select(product)
                    }
                  >
                    {qty[product.id] > 0 && (
                      <span>
                        {qty[product.id]} {t(product.orderUnit)}
                        {qty[product.id] === 1 ? "" : "s"} {t("in cart")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <nav
              className="pdf-page-navigation pdf-bottom-pages"
              aria-label={t("Catalogue pages")}
            >
              <label>
                {t("Page")}
                <select
                  aria-label={t("Catalogue page")}
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
                  {t("of")} {pages.length}
                  {` · ${visiblePages.length} ${t("visible pages")}`}
                </span>
              </label>
            </nav>
            {regions.length > 0 && (
              <details className="pdf-page-options" key={page.number}>
                <summary>{t("Adjust quantities for this page")}</summary>
                {regions.map(({ key, product }) => (
                  <div className="pdf-page-option" key={key}>
                    <div>
                      <strong>
                        {t(product.name)}
                        {product.catalogKey === "row-19"
                          ? ` - ${t("Twin")}`
                          : product.catalogKey === "row-20"
                            ? ` - ${t("Queen")}`
                            : ""}
                      </strong>
                      <small>
                        {product.sku} · 1 {t(product.orderUnit)} ={" "}
                        {product.unitsPerOrder} {t(product.unitLabel)}
                        {(product.minimumOrder ?? 1) > 1
                          ? ` · Minimum ${product.minimumOrder} packs`
                          : ""}
                      </small>
                      <small>
                        {t("Dealer")} {moneyFormat(dealerPrice(product))} /{" "}
                        {t("unit")} ·{t("Retail")} {moneyFormat(product.srp)} /{" "}
                        {t("unit")}
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
        <Modal
          title={t("Choose comforter size")}
          onClose={() => setChoices(null)}
        >
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
                {p.catalogKey === "row-19" ? t("Twin") : t("Queen")} ·{" "}
                {moneyFormat(dealerPrice(p) * p.unitsPerOrder)} {t("per case")}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function CatalogInstructions() {
  const { t } = useLanguage();
  return (
    <aside className="catalog-help" aria-label={t("How to order")}>
      <h3>{t("Click the catalogue to order")}</h3>
      <ol>
        <li>
          <strong>{t("Click anywhere on the page.")}</strong>
          {t("Order by the case.")}
        </li>
        <li>
          <strong>{t("Need more?")}</strong>
          {t("Click it again to add another pack or case.")}
        </li>
        <li>
          <strong>{t("Browse the catalogue.")}</strong>
          {t("Use the left and right arrows to turn pages.")}
        </li>
      </ol>
    </aside>
  );
}
