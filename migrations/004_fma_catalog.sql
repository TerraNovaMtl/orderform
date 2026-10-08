ALTER TABLE terranova.products ALTER COLUMN cost DROP NOT NULL;
ALTER TABLE terranova.products ALTER COLUMN cost DROP DEFAULT;
ALTER TABLE terranova.products ADD COLUMN dealer_price numeric(14,4) CHECK(dealer_price >= 0);
ALTER TABLE terranova.products ADD COLUMN minimum_order integer NOT NULL DEFAULT 1 CHECK(minimum_order > 0);
ALTER TABLE terranova.products ADD COLUMN company_id uuid REFERENCES terranova.companies(id);
ALTER TABLE terranova.products ADD CONSTRAINT product_price_basis CHECK(cost IS NOT NULL OR dealer_price IS NOT NULL);
ALTER TABLE terranova.orders ADD COLUMN customer_po text NOT NULL DEFAULT '';
ALTER TABLE terranova.orders ADD COLUMN contact_phone text NOT NULL DEFAULT '';
ALTER TABLE terranova.order_lines ADD COLUMN minimum_order integer NOT NULL DEFAULT 1;
CREATE TABLE terranova.catalog_imports (
  catalog_key text NOT NULL, product_key text NOT NULL,
  product_id uuid NOT NULL REFERENCES terranova.products(id),
  checksum text NOT NULL, source jsonb NOT NULL,
  PRIMARY KEY(catalog_key,product_key)
);
CREATE TABLE terranova.image_imports (
  checksum text PRIMARY KEY, image_id uuid NOT NULL REFERENCES terranova.images(id)
);
REVOKE ALL ON terranova.catalog_imports, terranova.image_imports FROM PUBLIC;
