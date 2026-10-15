"use client";
import { useEffect, useId, useRef } from "react";
import { useLanguage } from "./language";

export function CategoryFilter({
  categories,
  counts,
  excluded,
  onChange,
}: {
  categories: string[];
  counts: Record<string, number>;
  excluded: string[];
  onChange: (categories: string[]) => void;
}) {
  const { t } = useLanguage();
  const filterId = useId();
  const dropdown = useRef<HTMLDetailsElement>(null);
  const homeCategories = categories.filter(
    (category) => category === "Home" || /^Home\s*[-–—]\s*/.test(category),
  );
  const hasHomeChildren = homeCategories.some(
    (category) => category !== "Home",
  );
  const homeSelected = homeCategories.filter(
    (category) => !excluded.includes(category),
  ).length;
  const homeCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (homeCheckbox.current)
      homeCheckbox.current.indeterminate =
        homeSelected > 0 && homeSelected < homeCategories.length;
  }, [homeSelected, homeCategories.length]);
  function close(restoreFocus = false) {
    if (!dropdown.current?.open) return;
    dropdown.current.open = false;
    if (restoreFocus) dropdown.current.querySelector("summary")?.focus();
  }
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !dropdown.current?.contains(event.target)
      )
        close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && dropdown.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  const selectedCount = categories.filter(
    (category) => !excluded.includes(category),
  ).length;
  function categoryOption(category: string, child = false) {
    const index = categories.indexOf(category);
    const label =
      child && category === "Home" ? t("Other Home products") : t(category);
    return (
      <label key={category} htmlFor={`${filterId}-${index}`}>
        <input
          id={`${filterId}-${index}`}
          type="checkbox"
          aria-label={label}
          aria-describedby={`${filterId}-${index}-count`}
          checked={!excluded.includes(category)}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? excluded.filter((value) => value !== category)
                : [...excluded, category],
            )
          }
        />
        <span>{label}</span>
        <span
          id={`${filterId}-${index}-count`}
          className="category-product-count"
        >
          ({counts[category] ?? 0})
        </span>
      </label>
    );
  }
  return (
    <div className="category-filter-controls">
      <details className="catalog-category-dropdown" ref={dropdown}>
        <summary>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {t("Categories")}
        </summary>
        <div
          className="catalog-category-filter"
          role="group"
          aria-label={t("Browse by category")}
        >
          <button
            type="button"
            aria-label={t("Close categories")}
            style={{
              position: "absolute",
              top: 5,
              right: 5,
              width: 28,
              height: 28,
              padding: 0,
              border: 0,
              background: "transparent",
              color: "var(--muted)",
              fontSize: 20,
              lineHeight: 1,
            }}
            onClick={() => close(true)}
          >
            <span aria-hidden="true">×</span>
          </button>
          <h3
            style={{
              margin: "0 0 8px",
              paddingRight: 24,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {t("Browse by category")}
          </h3>
          <div className="catalog-category-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => onChange([])}
            >
              {t("Select all")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(categories)}
            >
              {t("Clear all")}
            </button>
          </div>
          <div className="catalog-category-options">
            {categories
              .filter(
                (category) =>
                  !hasHomeChildren || !homeCategories.includes(category),
              )
              .map((category) => categoryOption(category))}
            {hasHomeChildren && (
              <div
                className="category-home-group"
                role="group"
                aria-label={t("Home")}
              >
                <label htmlFor={`${filterId}-home`}>
                  <input
                    ref={homeCheckbox}
                    id={`${filterId}-home`}
                    type="checkbox"
                    aria-label={t("Home")}
                    aria-describedby={`${filterId}-home-count`}
                    checked={homeSelected === homeCategories.length}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? excluded.filter(
                              (category) => !homeCategories.includes(category),
                            )
                          : [...new Set([...excluded, ...homeCategories])],
                      )
                    }
                  />
                  <span>{t("Home")}</span>
                  <span
                    id={`${filterId}-home-count`}
                    className="category-product-count"
                  >
                    (
                    {homeCategories.reduce(
                      (total, category) => total + (counts[category] ?? 0),
                      0,
                    )}
                    )
                  </span>
                </label>
                <div className="category-home-children">
                  {homeCategories.map((category) =>
                    categoryOption(category, true),
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </details>
      {selectedCount < categories.length && (
        <span className="category-filter-chip" role="status">
          {t("Filtered:")} {selectedCount}{" "}
          {t(selectedCount === 1 ? "category" : "categories")}
        </span>
      )}
    </div>
  );
}
