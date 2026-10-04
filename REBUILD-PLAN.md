# Terra Nova: Vercel and database rebuild plan

Reviewed September 29, 2026. This is a source review and implementation plan, not a deployment or live-data audit.

## Implementation status — September 29, 2026

September 30 follow-up: the user confirmed successful admin Google sign-in on the deployed app. Migration preparation now includes a read-only `.xlsx`-to-JSON converter with five passing extraction tests. Automatic workbook access through the legacy clasp connection is unavailable (Sheets API disabled; Drive export cannot access the configured file). Awaiting an Excel download of the complete workbook. No business data has been imported or source Google permissions changed.

The initial rebuild is now implemented on `rebuild/vercel-postgres`. The supplied database is Neon, so the implementation uses Neon PostgreSQL plus Auth.js Google OAuth rather than adding Supabase. Migrations are applied to a private `terranova` schema. Existing Neon auth tables are untouched. Small image uploads currently use database storage; object storage remains a future adapter change.

Implemented: agent-scoped catalogs, generic access page, store lookup/create/contact correction, cost × 1.11 pricing, no inventory caps, atomic/idempotent orders, CSV/print, authenticated admin management, historical price-preserving order edits, soft deletion, audit entries, email outbox and worker, migration validation/import tooling, and automated tests. The initial allowlisted admin is `terranova.mtl.ai@gmail.com`; a session secret is configured locally.

Verified locally: production build, TypeScript, pricing/validation tests, database transaction/access tests, and desktop/mobile browser flows including admin authorization via signed test sessions. Actual Google consent/callback, real email delivery, real Sheet migration, backups and production cutover still require verification/configuration. See README.md for commands and remaining setup.

Deployment update, September 30: the app is linked to the verified `dunany/terranova-orderform` project (Jayem Nolan's projects; account `mtlaibaker`). Vercel automatically classified the first deploy as Production and assigned `https://terranova-orderform.vercel.app`; explicit protected preview deployments are also available. The cloud build and deployed access/database/image checks pass. Google OAuth initiation works, but interactive sign-in remains to be verified. The original GitHub Pages entry point is unchanged. Live data migration, email setup, separate preview data and cutover remain pending. See README.md for current URLs and exact OAuth callback. The earlier accidentally created empty project in Dunany Country Club was removed without receiving app secrets or deployments.

The original recommendations and phased plan below remain the review record; this implementation status and the confirmed requirements supersede earlier provider/access/inventory proposals.

## Recommendation

Keep the existing `terranovamtlai/orderform` GitHub repository. Rebuild the application using Next.js and TypeScript on Vercel, with Supabase Postgres, Auth, and Storage. Replace Apps Script email delivery with a transactional email service, provisionally Resend. Keep the current customer workflow and branding for the first release.

GitHub remains the source-code host; Vercel replaces GitHub Pages as the application host. A new repository is unnecessary unless ownership/access must change or the old app must remain a separately maintained product. A branch and separate Vercel project provide sufficient migration isolation. Vercel supports deployments from existing Git repositories and preview deployments: https://vercel.com/docs/git

Supabase is recommended because this app needs relational data, administrator identities, and uploaded images together. Neon Postgres would also fit the data model, but would require separate auth and storage choices. Vercel documents external Postgres providers rather than requiring a Vercel-owned database: https://vercel.com/docs/postgres and https://vercel.com/marketplace/supabase/supabase

## Review scope and current system

The actual repository is the `orderform` subdirectory, not its parent workspace. There are existing uncommitted changes in `admin.html`, `app.js`, and `google-apps-script.js`; preserve and account for these before branching. Findings below describe the local working files and may not match the deployed version. Live Sheets contents, GitHub Pages settings, production behavior, and account configuration were not inspected.

There is no package manifest, build system, or automated test suite in the inspected app. `index.html`, `styles.css`, and `app.js` implement the customer interface; `admin.html` contains the administrator UI and its inline logic. `google-apps-script.js` supplies the backend. A GitHub Actions workflow deploys Apps Script changes from main using clasp.

Current workflows to preserve:

- Vendor links using `index.html?vendor=CODE`, vendor-specific product visibility, company and agent details.
- Store-code lookup, contact registration, and contact maintenance.
- Categorized products with images, styles, descriptions, SKU/barcode, pack sizes, prices, and availability states.
- Quantity selection, order review, comments, submission, reference number, CSV, and printable order output.
- Email notifications to the business, customer, and agent.
- Admin product/image management, vendor/store management, order grouping and editing, cancellation, comments, and independent order-sent/invoice-sent/payment-received flags.

The backend uses Products, Orders, Counter, and Vendors sheets. Vendors combines agent rows and store contact rows. Orders combines individual lines and a specially named TOTAL row. Images are uploaded through Apps Script to the GitHub repository.

`CLAUDE.md` is outdated: current code uses POST for mutations and signed admin tokens; its three-sheet, GET-only, and remaining-inventory descriptions do not accurately describe the inspected implementation.

## Findings that should shape the rebuild

| Finding | Evidence in local source | Required treatment |
| --- | --- | --- |
| Catalog access relies partly on browser behavior | `handleGetProducts` returns all rows if vendor is omitted; vendor filtering does not verify vendor identity | Authorize catalog requests on the server and explicitly select customer-visible fields |
| Store contacts lack identity verification | `lookupStore` and `saveStore` are public; known vendor/store codes permit contact retrieval or changes | Require verified store sessions for contact access/updates; validate vendor/store relationships |
| Custom shared-password admin identity | Signed 12-hour tokens, browser sessionStorage, no individual admin identity | Supabase Auth, server-checked roles, secure session handling, and audit records |
| Order writes are not atomic | Counter read/write and line-by-line append in `handleSubmitOrder`, without locking | One database transaction for order, lines, reference allocation, and queued notifications |
| Email failure can look like order failure | Sheets writes precede synchronous `sendOrderEmail` | Commit order independently; persist notification jobs and retry safely |
| Retries can duplicate orders | No submission idempotency key | Unique request key; return the existing order when retried |
| Price rules are duplicated | Browser uses cost × 1.11; server normalization prefers stored dealer price | One authoritative pricing and rounding rule; persist order price snapshots |
| Order edits identify lines by name | `handleUpdateOrderLines` matches product names and accepts calculated totals | Stable line IDs; validate quantities and recalculate amounts on the server |
| Stock enforcement is absent in current order normalization | No stock balance/reservation/decrement in `normalizeSubmittedOrder_` | Decide whether v1 needs availability flags only or true stock accounting |
| Product cost is currently customer-visible | Product responses include cost and UI explicitly renders it | Confirm whether this is intentional before changing visibility |

Existing server-side price normalization and HTML/CSV escaping are useful behavior to preserve, rather than assuming all validation must be invented anew.

## Target architecture

Browser -> Next.js on Vercel -> server-side application services -> Supabase Postgres.

Supabase Auth supplies identities; Supabase Storage holds product images. A durable database outbox plus a scheduled worker sends transactional email. Keep order business logic in one application rather than splitting it among multiple backend platforms.

- Customer routes: vendor catalog, verified store access, order review, confirmation, CSV/print.
- Admin routes: products, vendors/stores, orders, and notification failures.
- Validate all mutations on the server. Derive identities and permitted recipients from trusted records, not submitted contact fields.
- Protect database tables with least-privilege access/RLS where exposed through Supabase; service credentials remain server-only. Privileged server access must still check application authorization.
- Use a pooled database connection appropriate for serverless workloads; perform multi-write operations in a single SQL transaction, not separate API calls. Supabase connection guidance: https://supabase.com/docs/guides/database/connecting-to-postgres
- Separate development/preview and production data, credentials, uploads, and email recipients. Previews must never send real order notifications or mutate production data.
- Keep schema migrations and seed fixtures in Git. Use database constraints, explicit money rounding, UTC timestamps with Toronto display, and structured error logging without exposing contacts or secrets.

## Proposed data model

| Tables | Purpose and constraints |
| --- | --- |
| companies / agents | One company has multiple agents. Each agent belongs to a company and owns a unique legacy company/access code, contact details, and active state |
| stores / agent_stores | Store code and contact fields with agent associations; preserve lookup by normalized agent access code plus store code during migration. Do not automatically merge stores across agents solely on matching store codes |
| user_roles / store_memberships | Admin roles and authorized user-to-store relationships linked to Auth identities |
| categories / products | Stable IDs, legacy product IDs, description/style, SKU/barcode as text, pack size, cost/dealer/SRP, availability and image reference |
| product_agents | Explicit catalog restrictions mapped from legacy vendor codes to agents; define unrestricted products separately from restricted products with no assignments |
| orders | Internal ID, unique historical/display reference, company/agent/store relationships, contact snapshots, totals, comments, timestamps, existing independent status flags, unique idempotency key |
| order_lines | Stable line ID, optional product relationship, immutable original product/SKU/barcode/pack/price snapshots, quantities and amounts |
| email_outbox | Order, recipient and notification kind, unique deduplication key, attempt count, next attempt, delivery state and provider ID |
| audit_events | Actor, time, order/product/contact change and relevant before/after data with restricted access |
| inventory_movements (conditional) | Only if actual stock management is required: receipts, reservations, releases, adjustments and fulfillment |

Use decimal money or consistently rounded integer cents, never floating-point totals as the source of truth. Preserve historical order pricing even when the current product price changes. Soft-disable referenced products/vendors instead of cascading deletion into history. Do not assume SKU or barcode is unique: local default products reuse them.

## Implementation phases and acceptance gates

### 1. Baseline and decisions

Account for existing local changes and preserve a recoverable legacy revision. Start an isolated rebuild branch; leave legacy production serving until cutover. Obtain a read-only export of all four sheets and an image manifest. Confirm required workflows against actual use and settle the decisions below.

Gate: agreed feature checklist, backed-up source data, known production URL and access model.

### 2. Foundation and database

Create the Next.js/TypeScript app, reusable layout and validation layer. Configure Vercel previews, Supabase environments, admin authentication, schema migrations, storage rules, and CI checks. Add a repeatable import tool with dry-run reports and legacy identifiers.

Gate: a protected admin can sign in to a preview using test data; unauthorized requests fail; schema can be rebuilt from migrations.

### 3. Catalog and admin management

Build product/category management, image uploads, vendor/store management, customer catalog and store access. Preserve mobile usability and current pack ordering. Validate upload type/size and use versioned object paths. Maintain legacy vendor query parsing on the new host.

Gate: representative products and vendor restrictions match the legacy system; contact access requires the intended identity; image changes require no repository commits.

### 4. Orders and notifications

Implement transactional order submission, idempotent retries, historical price snapshots, editing by line ID, status flags, cancellation, CSV and print. Add the email outbox, retry/backoff, failed-job visibility, and verified sender configuration. Resend supports provider idempotency, but retain durable application deduplication too: https://resend.com/changelog/idempotency-keys

Gate: duplicate requests produce one order; concurrent orders get distinct references; email outages do not lose orders; price tampering fails; edits and cancellation are audited. If stock is in scope, concurrent submissions cannot oversell and cancellation releases stock exactly once.

### 5. Migration rehearsal and verification

Import Products, split Vendors into vendor/store records, and group Orders into headers and lines using order references and TOTAL rows. Preserve status flags, comments, recipients, original dates and amounts. Retain original source row references for traceability. Preserve existing order numbers and initialize future numbering without collisions.

Historical order lines lack stable product IDs in the sheet layout: match only when unambiguous, otherwise retain a historical snapshot and report the unmatched reference. Detect duplicate store codes, malformed restriction JSON, missing TOTAL rows, inconsistent totals, missing images and orphaned records. Keep SKU/barcode/store codes as text to preserve leading zeros. Never silently repair monetary discrepancies or reprice historical orders.

Reconcile counts, order references, each status flag, quantities, and financial totals per order and in aggregate; document any exceptions. Test CSV formula escaping, printable output, duplicate product names, access boundaries, mobile ordering and recoverable failures. Imported history must not queue confirmation emails.

Gate: signed-off reconciliation report, representative end-to-end scenarios passing, database and image backup/restore rehearsed.

### 6. Controlled production cutover

Pause legacy writes, take a final export, run the reconciled import, and smoke-test production. Switch the domain or distribute new links, and prevent the legacy endpoint from accepting new writes. GitHub Pages URLs cannot be redirected by Vercel: leave a small Pages redirect/notice preserving vendor parameters where appropriate. Map any required store parameters too.

Disable the old Apps Script deployment workflow when retiring it; revoke unused clasp/GitHub upload credentials after the rollback window. Keep the original sheet as a read-only archive. Monitor submitted orders, failures and notification backlog closely after launch.

Rollback: before new production orders, restore the legacy entry point if needed. After new orders exist, pause writes and reconcile/export those orders before restoring Sheets; a hosting rollback alone does not undo database writes. Prefer rolling back application code against a backward-compatible schema.

Gate: one write authority, reconciled production data, working legacy-link transition, tested operational recovery.

## Confirmed requirements and deployment inputs

### Confirmed direction after review

- Work on branch `rebuild/vercel-postgres` in the existing repository. Existing uncommitted changes are preserved on this branch; no baseline commit has been made yet.
- Admins must sign in. Google OAuth is the preferred candidate; successful Google sign-in must also pass an explicit admin allowlist/role check.
- Simple customer ordering uses the company code in the URL, retaining compatibility with the existing `?vendor=CODE` parameter. No customer sign-in is planned for v1. Treat valid company links as shareable access links, not proof of an individual's identity.
- Missing company codes show a generic page advising the visitor to contact their vendor for access. Invalid or disabled codes should show the same generic page without exposing company data.
- No hard inventory tracking or reservations in v1. Orders may exceed current stock. Keep manual product availability/visibility controls, with no quantity cap based on stock.
- Keep pricing and customer-visible price columns as they are for v1, including the existing cost × 1.11 dealer calculation. Resolve the observed browser/server discrepancy using that established calculation and verify representative totals; do not introduce new pricing features.
- Keep store-code lookup. Under a valid agent access code, an existing store proceeds through the current contact-confirmation flow. If the store does not exist, prompt to create it and collect the current required contact fields. No customer sign-in or email-verification prerequisite is added. Scope lookups to the agent/store pair, return only required fields, rate-limit lookup/registration, and enforce uniqueness server-side to handle concurrent registrations. Preserve the current contact correction flow within this scope.
- A company has multiple agents. The URL's company code identifies a specific agent within that company, rather than the company alone. Resolve company and agent on the server and attribute orders, product access, store lookup, and agent notification recipients accordingly. Preserve existing `?vendor=CODE` links.
- These confirmed requirements supersede earlier recommendations for verified customer/store sessions, per-order-only contact entry, and conditional inventory work. Public ordering must still validate agent/company/product relationships on the server. The access model intentionally uses the agent link plus store code for remembered-store access.

No further business-rule answers are required to start the foundation. Preserve current currency, tax/shipping behavior, and agent-scoped store lookup. During data migration, explicitly review proposed company groupings rather than silently merging similar company names or store codes.

Before production deployment, obtain the production domain, verified email sender details, approved administrator email list, cloud account configuration, and the Sheets export. Confirm hosting region, backup retention, and expected volume when provisioning services.

No new repository, cloud services, deployment, or source-code rewrite has been performed by this review. Scope the first release to workflow parity plus the reliability and access-control fixes above; defer payments, accounting integration, and broader ERP features unless explicitly needed.
