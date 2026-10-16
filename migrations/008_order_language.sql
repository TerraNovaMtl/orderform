ALTER TABLE terranova.orders
  ADD COLUMN language text NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'fr'));
