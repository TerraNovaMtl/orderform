import pages from "./fma-pages.json";
import type { Product } from "./domain";

export function hasUploadedPage(product: Product) {
  return !product.catalogKey && product.image.startsWith("/api/images/");
}

export function catalogPages(products: Product[]) {
  const lastPage = Math.max(...pages.map((page) => page.number));
  const result = [
    ...pages,
    ...products.filter(hasUploadedPage).map((product, index) => ({
      number: lastPage + index + 1,
      image: product.image,
      width: 850,
      height: 1100,
      regions: [{ key: product.id, bounds: [0, 0, 1, 1] }],
    })),
  ];
  const positions = new Map(
    products.map((p, index) => [p.catalogKey || p.id, index]),
  );
  const rank = (page: (typeof result)[number]) =>
    page.regions.length
      ? Math.min(
          ...page.regions.map(
            (r) => positions.get(r.key) ?? Number.MAX_SAFE_INTEGER,
          ),
        )
      : -1;
  return result.sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}

// The sheet fits within 82vh and the available viewport width.
export const CATALOG_IMAGE_SIZES = "(max-width: 768px) 100vw, 600px";

export function catalogPageSrcSet(image: string) {
  if (!/^\/images\/fma-pages\/page-\d+-1600\.webp$/.test(image))
    return undefined;
  return `${image.replace("-1600.webp", "-800.webp")} 800w, ${image} 1600w`;
}
