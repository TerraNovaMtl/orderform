"use client";
import { createContext, useContext, useEffect, useState } from "react";
import french from "@/lib/fr.json";
type Language = "en" | "fr";
const LanguageContext = createContext({
  language: "en" as Language,
  t: (text: string) => text,
  setLanguage: (_language: Language) => {},
  setCategoryTranslations: (_translations: Record<string, string>) => {},
  money: (value: number) => "$" + value.toFixed(2),
});
export const useLanguage = () => useContext(LanguageContext);
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [categoryTranslations, setCategoryTranslations] = useState<
    Record<string, string>
  >({});
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem("tn-language") === "fr") setLanguage("fr");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  function change(value: Language) {
    setLanguage(value);
    try {
      localStorage.setItem("tn-language", value);
    } catch {}
  }
  const t = (text: string) =>
    language === "fr"
      ? (categoryTranslations[text] ??
        (french as Record<string, string>)[text] ??
        text)
      : text;
  return (
    <LanguageContext.Provider
      value={{
        language,
        t,
        setLanguage: change,
        setCategoryTranslations,
        money: (value: number) =>
          language === "fr"
            ? new Intl.NumberFormat("fr-CA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(value) + " $"
            : "$" + value.toFixed(2),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label="Language / Langue"
    >
      {(["en", "fr"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={language === value}
          lang={value}
          onClick={() => setLanguage(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
export function CustomerAccess() {
  const { t } = useLanguage();
  return (
    <main className="access-card">
      <span className="eyebrow">{t("Wholesale access")}</span>
      <h1>{t("A collection selected for your business.")}</h1>
      <p>
        {t(
          "This order form is available through your company agent’s personal link.",
        )}
      </p>
      <p>
        <strong>{t("Please contact your vendor for access.")}</strong>
      </p>
      <span className="access-line" />
    </main>
  );
}
export function CustomerFooter() {
  const { t } = useLanguage();
  return <footer>{t("Terra Nova · Wholesale ordering")}</footer>;
}
