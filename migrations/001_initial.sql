CREATE TABLE terranova.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE terranova.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES terranova.companies(id),
  code text NOT NULL UNIQUE CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 64),
  first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE terranova.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES terranova.agents(id),
  code text NOT NULL CHECK (code = upper(code) AND length(code) BETWEEN 1 AND 64),
  first_name text NOT NULL, last_name text NOT NULL, email text NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, code)
);
CREATE TABLE terranova.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legacy_id text UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) > 0), sku text NOT NULL DEFAULT '', barcode text NOT NULL DEFAULT '',
  cost numeric(14,4) NOT NULL DEFAULT 0 CHECK(cost >= 0), srp numeric(14,4) NOT NULL DEFAULT 0 CHECK(srp >= 0),
  order_unit text NOT NULL DEFAULT 'unit', units_per_order integer NOT NULL DEFAULT 1 CHECK(units_per_order > 0),
  unit_label text NOT NULL DEFAULT 'units', category text NOT NULL DEFAULT 'Gift Novelties',
  style text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','unavailable','hidden')),
  restricted boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE terranova.product_agents (
  product_id uuid NOT NULL REFERENCES terranova.products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES terranova.agents(id), PRIMARY KEY(product_id, agent_id)
);
CREATE SEQUENCE terranova.order_number;
CREATE TABLE terranova.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE,
  agent_id uuid REFERENCES terranova.agents(id), store_id uuid REFERENCES terranova.stores(id),
  company_name text NOT NULL, agent_name text NOT NULL, agent_email text NOT NULL,
  agent_code text NOT NULL, store_code text NOT NULL, contact_name text NOT NULL, customer_email text NOT NULL,
  comments text NOT NULL DEFAULT '', order_sent boolean NOT NULL DEFAULT false,
  invoice_sent boolean NOT NULL DEFAULT false, payment_received boolean NOT NULL DEFAULT false, cancelled boolean NOT NULL DEFAULT false,
  total_dealer numeric(16,2) NOT NULL CHECK(total_dealer >= 0), total_retail numeric(16,2) NOT NULL CHECK(total_retail >= 0),
  idempotency_key uuid UNIQUE, request_hash text,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE terranova.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES terranova.orders(id),
  product_id uuid REFERENCES terranova.products(id), name text NOT NULL, sku text NOT NULL, barcode text NOT NULL,
  order_unit text NOT NULL, unit_label text NOT NULL, units_per_order integer NOT NULL CHECK(units_per_order > 0),
  cost numeric(14,4) NOT NULL CHECK(cost >= 0), dealer_unit numeric(16,6) NOT NULL CHECK(dealer_unit >= 0), srp_unit numeric(14,4) NOT NULL CHECK(srp_unit >= 0),
  qty integer NOT NULL CHECK(qty > 0), line_dealer numeric(16,2) NOT NULL CHECK(line_dealer >= 0), line_retail numeric(16,2) NOT NULL CHECK(line_retail >= 0),
  removed boolean NOT NULL DEFAULT false
);
CREATE INDEX orders_date_idx ON terranova.orders(created_at DESC);
CREATE INDEX order_lines_order_idx ON terranova.order_lines(order_id);
CREATE TABLE terranova.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES terranova.orders(id),
  recipient text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
  provider_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id, recipient)
);
CREATE TABLE terranova.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL,
  entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- Small catalog images use the supplied database until an object store is configured.
CREATE TABLE terranova.images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_type text NOT NULL, data bytea NOT NULL,
  CHECK(octet_length(data) <= 2097152), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE terranova.rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
-- Private server-only schema. No direct anonymous/authenticated Data API grants.
REVOKE ALL ON SCHEMA terranova FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA terranova FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA terranova FROM PUBLIC;
