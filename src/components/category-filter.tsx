"use client";
import { useRef } from "react";
import { useLanguage } from "./language";

export function CategoryFilter({
  categories,
  excluded,
  onChange,
}: {
  categories: string[];
  excluded: string[];
  onChange: (categories: string[]) => void;
}) {
  const { t } = useLanguage();
  const dropdown = useRef<HTMLDetailsElement>(null);
  return (
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
          onClick={() => {
            if (dropdown.current) {
              dropdown.current.open = false;
              dropdown.current.querySelector("summary")?.focus();
            }
          }}
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
          {categories.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={!excluded.includes(category)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? excluded.filter((value) => value !== category)
                      : [...excluded, category],
                  )
                }
              />
              {t(category)}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
