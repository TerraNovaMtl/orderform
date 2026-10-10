ALTER TABLE terranova.products ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
WITH ranked AS (
  SELECT p.id, row_number() OVER (ORDER BY
    CASE WHEN ci.product_key ~ '^row-[0-9]+$' THEN substring(ci.product_key from 5)::integer ELSE 100000 END,
    p.category,p.name,p.id) AS position
  FROM terranova.products p
  LEFT JOIN terranova.catalog_imports ci ON ci.product_id=p.id AND ci.catalog_key='fma-2026'
)
UPDATE terranova.products p SET sort_order=ranked.position FROM ranked WHERE ranked.id=p.id;
CREATE INDEX products_sort_order_idx ON terranova.products(sort_order,id);
