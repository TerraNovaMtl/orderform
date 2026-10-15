"use client";
import styles from "./pdf-catalog.module.css";
import { useLanguage } from "./language";
import { useEffect, useState } from "react";
import {
  catalogPages,
  catalogPageSrcSet,
  CATALOG_IMAGE_SIZES,
  hasUploadedPage,
} from "@/lib/catalog-pages";
import { matchesProductSearch } from "@/lib/product-search";
import { dealerPrice, type DealerProduct as Product } from "@/lib/domain";
import { Modal } from "./shared";

export function PdfCatalog({
  products,
  allProducts,
  search,
  qty,
  add,
  controls,
}: {
  products: Product[];
  allProducts: Product[];
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
  const [pageNumber, setPageNumber] = useState(1);
  const [searchPageNumber, setSearchPageNumber] = useState(1);
  const selectPageNumber = search ? setSearchPageNumber : setPageNumber;
  const [choices, setChoices] = useState<Product[] | null>(null);
  useEffect(() => {
    setSearchPageNumber(1);
  }, [search]);
  const byKey = new Map(
    products
      .filter((p) => p.catalogKey || hasUploadedPage(p))
      .map((p) => [p.catalogKey || p.id, p]),
  );
  const matches = (p: Product) => matchesProductSearch(p, search, t);
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
    visiblePages.findIndex(
      (page) => page.number === (search ? searchPageNumber : pageNumber),
    ),
  );
  const currentPage = visiblePages[pageIndex];
  const nextPage = visiblePages[pageIndex + 1];
  const nextImage = nextPage?.image;
  const nextSrcSet = nextPage ? catalogPageSrcSet(nextPage.image) : undefined;
  useEffect(() => {
    if (!nextImage) return;
    const image = new Image();
    image.sizes = CATALOG_IMAGE_SIZES;
    if (nextSrcSet) image.srcset = nextSrcSet;
    image.src = nextImage;
  }, [nextImage, nextSrcSet]);
  const hasCatalogue = allProducts.some(
    (product) => product.catalogKey || hasUploadedPage(product),
  );
  if (!hasCatalogue || !currentPage) return null;
  function select(p: Product) {
    add(p);
  }
  return (
    <div className="pdf-catalog">
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
            className="pdf-page-card"
            style={{ marginBottom: 0 }}
            key={page.number}
            aria-label={`${t("Page")} ${page.number}`}
          >
            <div
              className={`pdf-reader-stage ${styles.stage}${regions.length > 2 ? ` ${styles.multiple}` : ""}`}
              style={{
                position: "relative",
                width: `min(100%, calc(${(82 * page.width) / page.height}vh + var(--pdf-left-space) + var(--pdf-right-space)))`,
                margin: "0 auto",
              }}
            >
              <button
                type="button"
                className="secondary pdf-turn pdf-turn-previous"
                aria-label={t("Previous catalogue page")}
                disabled={pageIndex === 0}
                onClick={() =>
                  selectPageNumber(visiblePages[pageIndex - 1].number)
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
                  selectPageNumber(visiblePages[pageIndex + 1].number)
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
                  srcSet={catalogPageSrcSet(page.image)}
                  sizes={CATALOG_IMAGE_SIZES}
                  alt={
                    regions.length
                      ? [
                          ...new Set(
                            regions.map(({ product }) => t(product.name)),
                          ),
                        ].join(", ")
                      : t("Terra Nova Canadian Living Collection")
                  }
                  loading="eager"
                  onLoad={(e) => {
                    if (catalogPageSrcSet(page.image)) return;
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
                {page.number === 1 && pageIndex < visiblePages.length - 1 && (
                  <button
                    type="button"
                    className={styles.coverNext}
                    aria-label={t("Next catalogue page")}
                    title={t("Next catalogue page")}
                    onClick={() =>
                      selectPageNumber(visiblePages[pageIndex + 1].number)
                    }
                  />
                )}
                {(page.number === 13 ? regions : regions.slice(0, 1)).map(
                  ({ key, bounds, product }) => (
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
                          product.status === "available"
                            ? "pointer"
                            : "default",
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
                        regions.length > 1 && page.number !== 13
                          ? t("Choose Twin or Queen comforter")
                          : `${t("Add")} ${t(product.name)} ${t("to cart")}`
                      }
                      title={`${t(product.name)} · ${moneyFormat(dealerPrice(product))} ${t("per unit")} · ${product.unitsPerOrder} ${t(product.unitLabel)} / ${t(product.orderUnit)}`}
                      onClick={() =>
                        regions.length > 1 && page.number !== 13
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
                  ),
                )}
              </div>
              {regions.length > 0 && (
                <div className={`pdf-page-cart-controls ${styles.controls}`}>
                  {regions.map(({ key, product }) => (
                    <div className={styles.control} key={key}>
                      {regions.length > 1 && (
                        <span className={styles.label}>
                          {product.catalogKey === "row-19"
                            ? t("Twin")
                            : product.catalogKey === "row-20"
                              ? t("Queen")
                              : page.number === 13
                                ? t(product.style)
                                : t(product.name)}
                        </span>
                      )}
                      {controls(product)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <nav
              className="pdf-page-navigation pdf-bottom-pages"
              aria-label={t("Catalogue pages")}
            >
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  width: "100%",
                  maxWidth: 480,
                }}
              >
                {t("Page")}
                <select
                  aria-label={t("Catalogue page")}
                  style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
                  value={currentPage?.number ?? ""}
                  onChange={(e) => selectPageNumber(Number(e.target.value))}
                >
                  {visiblePages.map((page, index) => (
                    <option key={page.number} value={page.number}>
                      {index + 1} —{" "}
                      {[
                        ...new Set(
                          page.regions.flatMap((region) => {
                            const product = byKey.get(region.key);
                            return product ? [t(product.category)] : [];
                          }),
                        ),
                      ].join(", ") || t("Cover")}
                    </option>
                  ))}
                </select>
                <span>
                  {t("of")} {visiblePages.length}
                </span>
              </label>
            </nav>
            {regions.length > 0 && (
              <details className="pdf-page-options" key={page.number}>
                <summary>{t("Adjust quantities for this page")}</summary>
                {regions.map(({ key, product }) => (
                  <div className="pdf-page-option" key={key}>
                    <div>
                      <strong>{t(product.name)}</strong>
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
  const [dismissed, setDismissed] = useState(true);
  if (dismissed)
    return (
      <button
        type="button"
        className={styles.reopenHelp}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "6px 16px",
          marginBottom: 18,
          background: "#fff7ef",
          color: "var(--navy)",
          border: "1px solid #e6c9b7",
          borderLeft: "4px solid var(--orange)",
          borderRadius: 9,
          fontSize: 12,
        }}
        aria-expanded={false}
        onClick={() => setDismissed(false)}
      >
        {t("How to order")}
        <span aria-hidden="true">⌄</span>
      </button>
    );
  return (
    <aside
      className={`catalog-help ${styles.help}`}
      style={{ position: "relative" }}
      aria-label={t("How to order")}
    >
      <button
        type="button"
        className={styles.closeHelp}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "var(--muted)",
          fontSize: 20,
          lineHeight: 1,
        }}
        aria-label={t("Close ordering instructions")}
        onClick={() => setDismissed(true)}
      >
        <span aria-hidden="true">×</span>
      </button>
      <h3>{t("Click the catalogue to order")}</h3>
      <ol>
        <li>
          <strong>{t("Click anywhere on the page.")}</strong>{" "}
          {t("Order by the case.")}
        </li>
        <li>
          <strong>{t("Need more?")}</strong>{" "}
          {t("Click it again to add another pack or case.")}
        </li>
        <li>
          <strong>{t("Browse the catalogue.")}</strong>{" "}
          {t("Use the left and right arrows to turn pages.")}
        </li>
      </ol>
    </aside>
  );
}
