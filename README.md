# Terra Nova order form

The database-backed rebuild lives in `src/` and runs on Next.js 16, React, TypeScript, Neon PostgreSQL, and Auth.js Google OAuth. The original HTML/Apps Script files remain at the repository root as a migration reference; they are not served by Next.js. The live legacy app has not been cut over.

## Local development

```sh
npm ci
npm run db:migrate
npm run dev
```

Use `.env.local` (ignored by Git), following `.env.example`. Migrations create only the private `terranova` schema; they do not modify `neon_auth`. Run migrations explicitly, not during builds. The runtime requires a PostgreSQL connection with permissions for this schema. `DATABASE_URL` is never exposed to the browser.

- `/`: generic contact-your-vendor page.
- `/?vendor=AGENT_CODE`: company/agent access, then store lookup or registration and catalog.
- `/admin`: protected workspace for products, companies/agents, stores and orders.
- `/index.html?vendor=...` and `/admin.html`: compatibility redirects on the new host.

The database initially has no business data. An approved administrator can create a company agent and products, or the source data can be imported after reconciliation. Do not populate a production catalog with test fixtures.

## Google admin sign-in

1. Create a **Web application** OAuth client in Google Cloud and configure its consent screen. If Google keeps the app in testing mode, add approved admins as Google test users too.
2. Add the exact redirect URI used locally: `http://localhost:3000/api/auth/callback/google`. If using `127.0.0.1`, register `http://127.0.0.1:3000/api/auth/callback/google` as well. Register the exact HTTPS production callback after the domain is confirmed.
3. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` from Google.
4. Generate `AUTH_SECRET` with `node scripts/configure-local-auth.mjs`, which writes a random secret only if missing and never prints it. A secret has already been generated in this local workspace.
5. Set `ADMIN_EMAILS` to comma-separated approved Google account emails. The initial admin is `terranova.mtl.ai@gmail.com`. Adding an email here does not bypass Google's consent/test-user requirements.

The app requires a verified Google email and checks the allowlist at sign-in and on every protected page/API request. Removing an email revokes that user's application access even if a session cookie still exists. OAuth client credentials and the session secret stay server-side. There is no password fallback or development admin bypass.

Browser tests use short-lived signed test cookies to verify authorization and admin behavior; they do not substitute for a manual Google consent/callback test. The user confirmed successful Google admin sign-in on the deployed app on September 30, 2026.

## Ordering rules

- One company has many agents. Each agent owns its access code, catalog restrictions, store associations and notification email.
- Store lookup is scoped to agent plus store code. A valid agent link and store code allow the existing contact-confirmation/correction workflow without customer sign-in.
- Missing/invalid/disabled agent codes expose no catalog. Public requests are rate limited.
- Dealer price remains cost × 1.11; cost remains visible. Decimal calculation rounds line totals to cents while retaining fractional unit prices, as the original calculation did.
- Manual available/unavailable/hidden product states remain. There is no stock reservation or stock-based quantity cap. Technical limits bound payload size and extremely large quantities.
- The server recalculates prices, resolves contact/agent recipients from saved records, and commits orders, line snapshots, audit entries and notification jobs together.
- Submission keys make retries idempotent. Product and order versions reject stale edits. Historical lines use stable IDs and retain original prices. Archived products do not remove historical orders.

## Email delivery

Configure `RESEND_API_KEY`, a verified `EMAIL_FROM`, `ORDER_EMAIL`, and a random `CRON_SECRET`. The existing business recipient defaults to `terranova.mtl.ai@gmail.com` when queuing an order, but delivery remains disabled until the email settings are complete.

Orders are accepted even if email is unavailable. The database outbox records one notification per order/recipient, snapshots the provider request on first send, and retries with a stable provider idempotency key. Failed and pending counts appear in the admin workspace. Orders marked sent/invoiced/paid are business workflow flags, independent of notification delivery.

New orders trigger the worker after the response. Also schedule authenticated `GET /api/jobs/email` (bearer `CRON_SECRET`) every five minutes for recovery; use Vercel Cron or another scheduler appropriate to the account plan. No scheduler or email provider has been provisioned yet. Configure schedule and secrets before launch. Ambiguous retries older than 23 hours require review instead of automatic replay beyond the provider's deduplication window.

Email is suppressed outside `VERCEL_ENV=production` unless `EMAIL_TEST_TO` is explicitly set. In that case all mail goes to that controlled test inbox. Use a separate database for previews before enabling production so a preview worker cannot claim production notification jobs.

## Images

Existing assets are copied to `public/images`. New uploads are limited to PNG/JPEG/WebP/GIF, signature-checked and capped at 2 MB. They are currently stored in Neon and served through immutable `/api/images/:id` URLs, so no additional storage secret is required. For a growing catalog, move this adapter to object storage (e.g. Vercel Blob); database image storage is a deliberate initial tradeoff, not a dependency on GitHub commits. Backups must include images.

## Migration from Sheets

The simplest input is a complete Excel download from Google Sheets: **File → Download → Microsoft Excel (.xlsx)**. Keep the Products, Vendors, Orders, and Counter tabs unchanged. Save it inside ignored `migration-data/`, then run `python scripts/convert-sheet-export.py migration-data/workbook.xlsx` with a Python environment containing `openpyxl`. This reads the workbook without changing it, preserves identifier formatting and checkbox types, rejects spreadsheet errors or uncached formulas, and writes the JSON expected below. Conversion does not import anything into the database.

The existing clasp connection was checked on September 30: direct Sheets access returned `SERVICE_DISABLED`, and Drive export could not access the configured file. No Google permissions or source-sheet values were changed. A workbook export from an account that can open the sheet is needed to proceed.

The importer accepts JSON shaped like:

```json
{
  "Products": [
    {
      "id": "1",
      "name": "Example",
      "cost": 1,
      "srp": 2,
      "unitsPerOrder": 6,
      "vendorCodes": "[]"
    }
  ],
  "Vendors": [
    {
      "code": "AGENT001",
      "company": "Example Co",
      "storeCode": "",
      "firstName": "Agent",
      "lastName": "Name",
      "email": "agent@example.com"
    }
  ],
  "Orders": [],
  "Counter": 0
}
```

Export each sheet as an array of objects keyed by its exact header text. Include **all** columns; the example above is illustrative, not a production seed. Orders use the existing `Order ID`, `Order Qty`, `Total Units`, `Line Dealer ($)`, etc. keys, including TOTAL rows. Keep identifiers/barcodes/store codes as strings and timestamps as ISO values or legacy Toronto local timestamps. Store exports in ignored `migration-data/`.

```sh
npm run db:import -- migration-data/export.json
npm run db:import -- migration-data/export.json --apply
```

The default is a dry run. The importer checks duplicate identifiers, missing agents, pack sizes, catalog restrictions, and per-order totals. Application tables must be empty for `--apply`; it refuses to overwrite existing orders or catalogs. The transaction imports original references/prices/statuses and resumes the sequence, with source-row audit metadata. Imported orders do not queue emails. Unmatched historical products remain snapshots. Legacy original cost is unknown and stored as NULL, not invented from today's cost. Review warnings, exact company-name groupings, image availability, and source/target reconciliation before cutover. Rehearse on a separate database first.

The actual live Sheet export and a real-data migration rehearsal are still required. The importer has fixture tests but has not been verified against the live workbook.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Database integration test (PowerShell):

```powershell
$env:RUN_DB_TESTS='1'
node --env-file=.env.local --import tsx --test tests/integration.test.ts
```

With the development server running, `node --env-file=.env.local --import tsx scripts/browser-smoke.ts` runs Chrome checks for desktop/mobile ordering and signed admin sessions. Both suites create uniquely named temporary records and remove only their fixtures. Use a development database. Screenshots go into ignored `test-results/`. No mail is sent by these tests unless you explicitly enable the worker settings; keep test email configuration disabled.

## Vercel deployment and cutover

Target project: **terranova-orderform**, owned by **Jayem Nolan's projects** (`dunany`), signed in as `mtlaibaker`. The mistakenly created empty Dunany Country Club project was removed; no app credentials were uploaded and no deployment was made there.

On September 30, 2026, the cloud build and deployed read-only checks passed. The project URL is https://terranova-orderform.vercel.app and the admin entry is `/admin`. Vercel classified the first CLI deployment as Production automatically despite no `--prod` flag. The existing GitHub Pages site was not changed. Subsequent preview deploys explicitly use `vercel deploy --target preview --scope dunany`.

Latest protected preview: https://terranova-orderform-jxpcblbht-dunany.vercel.app (requires Vercel access). The generic access page, database connectivity through rejected unknown-agent requests, admin API authorization, and image delivery were checked. Google OAuth initiation works; the interactive callback is not yet verified. Register `https://terranova-orderform.vercel.app/api/auth/callback/google` in the Google OAuth client's authorized redirect URIs for the project hostname. Preview OAuth requires its own exact hostname callback.

Database and auth environment variable names are present in Preview and Production. The database variable currently applies to both environments; provision a separate preview database before live business use. No live Sheet data has been imported and email delivery is not configured. `.vercelignore` excludes local environment files, test fixtures, legacy assets and scripts from deployment while retaining `public/images` and the image API.

1. Sign into the correct account and verify its team; link using an explicit scope.
2. Configure Preview environment values using a separate development database. Protect preview deployments and use a stable preview hostname if testing Google OAuth.
3. Run tests and create a preview deployment for review. Register its Google callback URI.
4. Import/reconcile the live Sheets export during an agreed write freeze, then configure Production credentials, verified email sender, scheduler and backups.
5. Switch the public entry point only after acceptance. Keep legacy Sheets read-only. GitHub Pages needs its own redirect/notice to preserve old agent links; Vercel redirects cannot redirect another hostname.
6. Retire the old Apps Script GitHub Actions workflow and unused credentials after the rollback window. This rebuild has not disabled the legacy deployment workflow.

Keep production and preview secrets/data separate. A code rollback does not roll back database writes; reconcile any new orders before returning to Sheets. No live cutover is included in the current local rebuild.

### Workbook migration completed September 30, 2026

The user confirmed production Google admin sign-in. The supplied `TerraNovaOrderSheet.xlsx` snapshot was imported: 20 products, 3 companies, 6 agents, 7 stores, 26 orders and 98 order lines. The user explicitly excluded orphan store 123456 under missing agent PUKO6ZV7. The earliest order has no agent and remains a historical snapshot. Its missing historical cost and contact name were not invented.

The converter recognizes the exact stale 11-heading Orders sheet with the 23-column data layout documented in Apps Script. Original workbook and extraction remain unchanged in ignored `migration-data`; an approved copy records the exclusion. All order totals, line quantities/prices and order status flags reconciled after commit using `scripts/verify-import.mjs`. No email jobs were created. Workbook SHA-256: `f5c871846b4ad816a41307796418438fee474b500c53f744ae850c5cef55f2c1`.

This snapshot import supersedes the earlier pending-import note. It is not a final cutover: the legacy site/Sheet remains unchanged. Any later Sheet changes require reconciliation before switching customer links. Email sender setup, a separate preview database and final cutover remain pending.
