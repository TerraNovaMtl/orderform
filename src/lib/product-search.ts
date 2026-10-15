import french from "./fr.json";
import type { Product } from "./domain";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function matchesProductSearch(
  product: Pick<Product, "name" | "sku" | "category" | "style">,
  query: string,
  translate: (text: string) => string = (text) => text,
) {
  const fields = [product.name, product.sku, product.category, product.style];
  const terms = fields.flatMap((field) => [
    field,
    translate(field),
    (french as Record<string, string>)[field] ?? "",
  ]);
  if (/\bsocks?\b/i.test(product.name)) terms.push("bas chaussettes");
  return normalize(terms.join(" ")).includes(normalize(query));
}
