"use client";
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
  return (
    <details className="catalog-category-dropdown">
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
      <fieldset className="catalog-category-filter">
        <legend>{t("Browse by category")}</legend>
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
      </fieldset>
    </details>
  );
}
