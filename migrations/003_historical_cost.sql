-- Legacy order rows never stored original cost. Preserve unknown cost as NULL, not a fabricated zero.
ALTER TABLE terranova.order_lines ALTER COLUMN cost DROP NOT NULL;
