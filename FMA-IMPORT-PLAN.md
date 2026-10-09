# FMA catalog import and order form alignment

Reviewed October 7, 2026. The original PDF and workbook are unchanged. The initial review was read-only; implementation and staging have now been completed as described below.

## Implementation and staging completed

- Prepared 97 orderable products from all 31 workbook rows, including per-color clothing records and the reviewed PDF corrections. Sweaters are split into ten style packs of 36 items; colours within each style and soccer-shirt assortments remain intact.
- Extracted and uploaded 97 product images. Manifest, crops, before-state backups and reconciliation reports are in ignored `migration-data/fma-2026/`.
- Applied migration 004 to the separate test database and main database. Implemented exact dealer pricing, unknown costs, company UUID restrictions, minimum order snapshots, optional PO/phone, Canadian Tire banner and admin editing controls.
- Imported and verified the test catalog, including a repeat import that created no duplicates. Loaded all 97 records into the main database as **hidden**. All 20 existing main catalog products were verified unchanged.
- Pricing, minimum quantity, company access and historic snapshot database tests passed. Typecheck, build and regression tests passed. Local browser review confirmed Canadian Tire branding, the four-pack sock selection totaling $266.40, and PO/phone in review without submitting an order.
- The updated application has not been deployed. Main records must remain hidden until deployment, because the previous app calculates dealer price from cost. `--publish` enables the staged records after reviewed deployment; it refuses products whose pricing/identity changed after import.

Actual entry points: `scripts/prepare-fma.py`, `scripts/import-fma.ts`, `scripts/verify-fma.ts`, and `scripts/run-db-tests.mjs`. New records default to hidden. Changes to a previously imported manifest require explicit `--update`; product version checks detect concurrent edits, and every apply saves a before-state backup. Image checksum mapping reuses existing image UUIDs.

## Confirmed business decisions

The user's decisions below supersede the unresolved recommendations elsewhere in this review. The reconciliation table retains original discrepancies as evidence.

- Comforters: PDF identifiers win. Twin CT SKU is **6462760**; Queen CT SKU is **6462759**.
- Duncan King quilt: use PDF CT SKU **6462235**.
- Soccer shirt: reverse the PDF's labels. CT SKU is **6841779**, UPC is **809565048508**, manufacturer code SOC909-400.
- Cargo shorts: user identifies **PDF page 4** as the shorts source. Preserve the original PDF title as raw evidence, use this page for the shorts record, and treat page 15 as its pictured joggers rather than Excel's cargo-shorts label. Page 3 remains the separate active cargo-short product.
- Style 7010SLM: use **PDF page 16** for identity and pricing: CT **6872219**, dealer **$19.43**, retail **$29.99**. Use Excel's case quantity 9 where the PDF provides none.
- Pages 18 and 20 are **separate products**: page 18 is style **8012SLM**; page 20 is **8014SLM**. Correct Excel's descriptions/style mapping rather than merging these products. Both use their respective PDF identity and pricing.
- Customers choose clothing colors. Create distinct orderable color records for clothing, retaining assorted sizes within each pack. Existing explicitly mixed supplier assortments (such as sweater minimum 36 and soccer-shirt assorted case 30) need their composition retained; do not silently convert an assorted case into a single-color case with the same count without source support.
- Socks: **4 ordering packs = 48 sellable three-pair gift packs**, so **one ordering pack = 12 sellable gift packs**, containing all four variations: Barnyard, Princess, Truck and Monsters. Dealer remains **$5.55 per gift pack**, retail **$9.99**. Thus one ordering pack is **$66.60**, and four packs are **$266.40**, with 144 pairs inside the 48 gift packs. Record a minimum of four ordering packs and enforce it in checkout. The user has not specified that orders must be multiples of four packs beyond that minimum, or that each variation has equal counts; do not invent either rule. Preserve all ten bottom-of-page CT SKU identifiers as assortment identifiers, not ten independent selectable products or invented design mappings.
- This catalog is **Canadian Tire stores only**, with the Canadian Tire logo in the page banner after a Canadian Tire store is identified.
- Charge the **published dealer prices exactly**. Do not add another 11%. Known CTC cost remains separate.
- **Customer PO number and phone are optional checkout fields**, alongside comments before submission. Continue using the existing store email associated with access/registration; do not add another required email input.

### Canadian Tire eligibility and banner implementation

The current customer flow uses an agent access link followed by store lookup/confirmation or registration. OAuth is currently for administrators. Each store belongs to one agent, each agent belongs to one company, and an agent can manage multiple stores. The supplied admin screenshot confirms an existing **Canadian Tire** company with its own agents. Use that existing company relationship to identify Canadian Tire stores, with the company UUID as the authoritative identity once mapped. No additional retailer classification is needed for the current data model. Do not infer membership from email addresses or store codes alone.

Restrict FMA products to agents belonging to the reviewed Canadian Tire company and enforce the same restriction in server checkout. Render the Canadian Tire logo in the banner from the validated agent/company relationship after access/store confirmation. Source the logo from the supplied PDF and retain Terra Nova branding. If agent-company membership changes later, synchronize FMA restrictions accordingly. Admin store creation selects an existing active agent, so company membership follows that agent.

The Stores tab now supports adding a store under an active agent, editing its code/contact, and deactivating it from the list or edit dialog. Deactivation preserves historical orders. Agent reassignment is outside this change: the current update path intentionally retains the store agent.

### Additional implementation changes from these decisions

1. Add structured assortment identifiers (a linked identifier table or validated metadata) so the socks retain all ten CT SKU values without a false single identifier or ten separately orderable products. Select one assortment UUID in the cart. Display/export its identifier list clearly for fulfillment.
2. Add a product-level minimum ordering quantity for the socks: 4 packs, `unitsPerOrder=12`, `orderUnit=pack`, `unitLabel=gift packs`. Allow no sock order (zero/removal); reject submitted quantities 1 through 3 on the server. Provide a clear initial selection of 4 packs in the UI and validate increments beyond that minimum without assuming a four-pack step rule.
3. Add optional `customerPo` and `contactPhone` fields across checkout, drafts, review, request validation/idempotency signature, order persistence/snapshots, admin, email, receipts and exports. Existing orders default to blank. Phone is checkout information, not a replacement for existing email identity.
4. Recompute the final manifest totals after correcting identifiers, prices and color records. The original 31-row totals below remain a baseline of the uncorrected workbook only.

## Sources and review findings

- `data/Terra_Nova_FMA_Products_ 2026.pdf`: 27 physical pages, including one cover. Visually reviewed every page, with enlarged inspection of conflicting bedding and soccer identifiers. Most pages contain image-based text. Ordinary PDF text extraction is insufficient; page 13 has useful text for five separate quilt products.
- `data/Terra_Nova_FMA_Products_Order_Form.xlsx`: one worksheet, `FMA Order Form`, 31 product rows (`10:40`), 96 formulas, no embedded product images and no quantity validation. It supplies category, product, style, CT SKU, UPC where present, dealer price, retail, case size and fulfillment notes. The zero quantities are a blank order template, not inventory or historical orders.
- Active implementation: `src/`, especially `src/lib/domain.ts`, `src/lib/repository.ts`, `src/lib/images.ts`, `src/components/catalog.tsx` and `migrations/001_initial.sql`. Legacy `app.js` and Apps Script are migration references.

Use Excel as the order calculation and pack reference. Use the PDF for photos, manufacturer codes, visual product identity and source pricing. Retain both values when sources disagree. Do not silently correct or publish conflicting records.

## Required quantity and pricing semantics

An order quantity is a count of cases/packs. A priced unit is one sellable item, which can itself be a set or a sock gift pack.

```
totalUnits = orderQty * unitsPerOrder
lineDealer = roundToCents(totalUnits * dealerPricePerUnit)
lineRetail = roundToCents(totalUnits * retailPricePerUnit)
dealerMargin = (retailPricePerUnit - dealerPricePerUnit) / retailPricePerUnit * 100
order totals = sum of rounded line totals
```

This matches Excel columns K, L, M and I and the app's existing quantity multiplication. Keep integer quantity controls: one click adds one case/pack. Never multiply the dealer price by the pack count during import and then multiply again during checkout.

Examples:

- Active cargo shorts: 2 cases * 6 units = 12 shorts; dealer $13.04 each; dealer total $156.48; retail total $239.88.
- Daphne: 1 case * 4 sets = 4 sellable three-piece quilt sets; dealer total $93.24. The three pieces inside each set do not make `unitsPerOrder` equal to 12.
- Kids socks: a sellable unit is one three-pair gift pack at $5.55, not one pair. A 48-gift-pack assortment would total $266.40 and contain 144 pairs, but the PDF specifies an assorted minimum of 48 units. Confirm whether this is a fixed assortment or a mixed minimum before enabling ordering.

### Pricing gap that must be addressed before import

The current app has no explicit dealer-price field. It stores `cost` and computes `cost * 1.11` in both display and server checkout. This correctly implements existing catalog pricing, but does not always reproduce Excel's cent-rounded unit prices.

PDF page 11 gives queen comforter CTC cost $20.95 and dealer $23.25. Current calculation produces $23.2545 and $139.53 for six sets. Excel uses $23.25 and produces $139.50. Importing $23.25 as `cost` would incorrectly add another 11%. Reverse calculating cost from dealer price would invent cost and still risk rounding differences.

Recommended additive change:

1. Add nullable `products.dealer_price numeric(14,4)` with a nonnegative check. Null means the existing cost-times-1.11 behavior. FMA records use the published dealer price explicitly.
2. Preserve known CTC costs ($19.95/$20.95 on page 11 and $21.00 on page 13). For records with no CTC cost, support nullable product cost rather than fabricating zero or back-calculating. This requires changing the current product NOT NULL/default constraint, API validation, mapping and admin input/display. A missing cost is acceptable only when an explicit dealer price exists.
3. Add one shared effective dealer-price function: explicit dealer price if present, otherwise known cost * 1.11. Use it for catalog, margin, lightbox, cart, confirmation, server checkout and persisted `dealer_unit`. Validate that at least one price basis exists.
4. Keep line rounding and historical snapshots. `order_lines.cost` already permits null (migration 003). Existing `dealer_unit`, `srp_unit` and `units_per_order` snapshots support FMA ordering without recalculating old orders from current catalog prices. Existing order edits must continue using `snapshotAmounts`.
5. Existing products retain null explicit dealer price, unchanged stored costs and unchanged totals. Update admin forms to distinguish CTC cost from dealer selling price. Show missing cost as unavailable rather than $0.00.

Printed margins are source evidence, not pricing inputs. Recompute margins from effective dealer price and retail. Small differences such as 35.21% versus 35.23% should be recorded as printed rounding discrepancies, not used to derive another dealer price.

## Product boundaries and reconciliation register

Physical PDF page = Excel `Slide` + 1 for these sources. Use physical page numbers in the manifest. Start with the 31 Excel rows as reconciliation entries, not an assumed final product count. Split independently orderable sizes, styles and colors; keep supplier assortments intact. Do not create selectable sizes or color choices merely because they are pictured.

| PDF page | Excel row(s) | Product boundary and required review |
| --- | --- | --- |
| 1 | none | Cover only; no product record. |
| 2 | 10 | Northern Trek sweaters, CT 6872709. User confirmed ten separately orderable manufacturer styles, each a pack of 36 assorted items: 7271MNT, 7273MNT, 7270MNT, 7266MNT, 7267MNT, 7272MNT, 7268MNT, 7274MNT, 7269MNT, 7264MNT. Map each group independently and retain its style number in the product name and order snapshots. |
| 3 | 11 | Active cargo shorts, CT 6872688, pack 6. Excel says pack per color, assorted sizes: create Black, Charcoal and Sky Blue orderable records if confirmed, sharing the CT SKU and differing by stable color key. |
| 4 | 12 | Fleece shorts, CT 6872684, pack 9 per color. Eight colors pictured; reconcile permitted colors before expanding records. |
| 5 | 13 | Kids cushions, CT 6880745, case 24, assorted designs. Individual designs are not confirmed as separately orderable. |
| 6 | 14 | Kids three-pair sock gift packs. Ten full CT SKUs: 6873145, 6873146, 6873148, 6873147, 6873149, 6873150, 6873152, 6873153, 6873144, 6873151. Excel abbreviates the list and PDF pictures four design groups. Do not guess the SKU-to-design mapping. Resolve mixed minimum 48 versus fixed case 48 and selection rules. |
| 7 | 15 | Blue Moon pillows, CT 6460985, case 24 assorted. Dimensions/pieces are description metadata, not case quantity. |
| 8 | 16 | Soccer shirts, manufacturer SOC909-400, case 30 assorted. PDF labels CT SKU as 809565048508 and UPC as 6841779; Excel CT SKU is 6841779 and UPC blank. Likely reversed PDF labels; block identifier publication until confirmed. |
| 9 | 17 | Hooded throws, CT 6461688, case 24 assorted. Excel UPC 688466117120 is also the PDF's aggregate footer UPC; retain individual pictured design identifiers only as unverified source metadata. |
| 10 | 18 | Bird's Nest throws, CT 6430302, case 18 assorted. Excel UPC `060971618512` must remain a string with its leading zero. |
| 11 | 19, 20 | Two products: Twin two-piece and Queen three-piece comforter sets, case 6 each. Excel uses CT 6463180 for both; PDF lists 6462760 / 6462759. Confirm which CT code belongs to each size. Prices agree; cost-versus-dealer rounding gap described above. |
| 12 | 21 | Duncan King three-piece quilt set, case 6. PDF CT 6462235 conflicts with Excel 6463180. Preserve Duncan identity and King size; confirm identifier. |
| 13 | 22:26 | Five separate DQ three-piece quilt sets: Daphne, Whisper, Symphony, Dream Blue and Forever Blue. Each has its own CT SKU, manufacturer code and UPC. Excel supplies case 4, absent from this PDF page. These are five separate records and five photo crops. |
| 14 | 27 | Faux fur carpet, CT 6681439, case 12 assorted, 36 x 60 inches. |
| 15 | 28 | PDF says Men's Joggers, Excel says Cargo Shorts. PDF/Excel agree CT 6872219, dealer $15.54 and case 9. Block name/type until confirmed. |
| 16 | 29 | Style 7010SLM. PDF CT 6872219 / dealer $19.43 / retail $29.99; Excel CT 6872202 / dealer $15.54 / retail $24.99. Case 9 comes from Excel, not the PDF page. Block identifiers and prices until confirmed. |
| 17 | 30 | Style 8010SLM, CT 6872219, dealer $19.43 / retail $29.99 agree. Case 9 supplied by Excel. |
| 18 | 31 | PDF is cargo joggers style 8012SLM; Excel says fleece joggers / Classic Jogger. Confirm product name and style mapping. Case 9 supplied by Excel. |
| 19 | 32 | Style 8013SLM cargo joggers; CT 6872219 and prices agree. Case 9 supplied by Excel. |
| 20 | 33 | PDF style 8014SLM conflicts with Excel style 8012SLM. Confirm style before matching/import. Case 9 supplied by Excel. |
| 21 | 34 | Terra Nova joggers, CT 6872202; prices agree. Black/Grey/Navy shown; Excel gives case 9 but does not explicitly say pack per color. Keep assortment pending clarification. |
| 22 | 35 | Side-stripe joggers, CT 6872218, case 9, prices agree. |
| 23 | 36 | Ladies cargo pants, CT 6872202, case 9, prices agree. Do not merge with men's joggers that share this CT SKU. |
| 24 | 37 | Quarter-zip polos, CT 6872683, pack 9 per color. Sky, Teal, Black, Navy Blue if color ordering confirmed. |
| 25 | 38 | Poly-mesh jackets, CT 6872690, pack 9 per color. Ash, Black, Blue if color ordering confirmed. |
| 26 | 39 | Windbreaker jackets, CT 6872688, pack 6 per color. Black, Navy Blue, Sky Blue. Same CT SKU as active cargo shorts: never merge by SKU. |
| 27 | 40 | Pocket cutlery, CT 6424189, case 24. Six functions do not mean six priced units. |

The final count depends on color selection and sock assortment decisions. Missing manufacturer codes and UPCs stay blank. Check digits and expected identifier lengths may flag problems, but never authorize automatic replacement.

## Field mapping

| Source | Database/application destination | Treatment |
| --- | --- | --- |
| CT SKU | `products.sku` | Text, nonunique; one reviewed value per orderable record. Do not put a slash-separated list into an individual product SKU. |
| UPC | `products.barcode` | Text; preserve zeros; retain raw extraction separately. |
| Product | `products.name` | Include orderable size/color where needed to make ordering unambiguous. |
| Style / manufacturer code | `products.style`, proposed `manufacturer_code` | Preserve manufacturer code distinctly from color/size. Structured code is recommended for future imports/search. |
| Category | `products.category` | Preserve useful Excel categories, normalize whitespace. |
| Notes, contents, dimensions | `products.description` and source manifest | Fulfillment notes must be visible before ordering. Internal conflict notes belong in import review, not customer copy. |
| Case Pack | `units_per_order` / `unitsPerOrder` | Positive integer, number of sellable units in one ordered case/pack. |
| Case or pack | `order_unit` / `orderUnit` | `case` for fixed cases; `pack` for packs per color. |
| Sellable unit | `unit_label` / `unitLabel` | `sets`, `gift packs`, `shirts`, etc. Physical contents belong in description. |
| Dealer Price | proposed `dealer_price` / `dealerPrice` | Exact published per-unit amount. |
| Suggested Retail | `srp` | Exact per-unit amount. |
| CTC cost where explicitly supplied | `cost` | Known source cost only. |
| Dealer Margin | manifest `printedMargin` | Recomputed for UI; printed value retained for reconciliation. |
| Cropped product photo | `images.data`, `images.content_type`; `products.image` | Database image UUID referenced as `/api/images/<uuid>`. |
| Source identity | proposed import mapping table | Stable catalog namespace + orderable product key; not SKU, page number or Excel row alone. |

For SKU reuse, use a product mapping table with unique `(catalog_key, source_product_key)` and product UUID. Store batch ID, source file hashes, worksheet/row, PDF page, crop rectangle, raw values, resolved values and resolution notes in the manifest/audit. Product UUID remains the cart/order identity. Avoid repurposing `legacy_id` for this catalog: it already identifies legacy migrations.

## Image extraction and upload

1. Hash and archive the unmodified sources locally. Render each PDF page at sufficient resolution for OCR and crops. Keep original page coordinates and a normalized crop rectangle in the manifest.
2. Extract embedded image assets where usable. Many pages are flattened marketing artwork: an extracted page image is not automatically a product photograph. Crop actual product regions from a rendered page when necessary.
3. Produce one reviewed primary image per orderable record. Page 13 needs five independent bedding crops. Page 11 needs separate Twin and Queen package images. A confirmed color variant gets its own color crop where possible. A supplier assortment gets a representative assortment image, not a misleading single-color image.
4. Exclude price banners, CT logos, promotional text and unrelated products from primary thumbnails. Retain the original page as evidence in the import folder. Do not invent or regenerate product photography.
5. Encode PNG/JPEG/WebP, optimize dimensions and verify every file is under 2,097,152 bytes. Inspect the crop at thumbnail and lightbox sizes. Calculate a SHA-256 checksum for deduplication and reruns.
6. Existing admin upload is `POST /api/admin` with `action: "uploadImage"` and `contentBase64`; it validates format, stores bytes in `terranova.images`, audits the upload and returns `/api/images/<uuid>`. `GET /api/images/[id]` serves the bytes. This storage matches the requested database upload; no object store is required initially.
7. For the batch importer, use equivalent image validation and transactional inserts with product linking and audit events in the same transaction. The current admin upload/save calls are separate transactions, so chaining them does not provide atomic bulk import. Add checksum mapping/deduplication because `images` currently has no checksum column and uploads otherwise create duplicate rows.
8. Keep source evidence privately in the import artifacts. Image endpoints are publicly readable and cached; do not put internal pricing/conflict reports into image rows.

## Implementation sequence

### 1. Build the review manifest without database writes

Create `migration-data/fma-2026/manifest.json`, product records and optimized image files. Each record includes a stable product key, source row/page, raw CT SKU/UPC/code, category, name, style, color/size selection basis, unit prices, case quantity, image hash/crop, and unresolved issues. Join sources using page/row plus visual identity, not SKU alone. OCR proposes text; visually compare every identifier, price and pack quantity against the page and workbook.

Produce a reconciliation report for all 31 workbook rows. It must show resolved, split, merged-by-explicit-decision, or blocked status for every row and account for every non-cover PDF page. Manufacturer variants pictured within an assortment are recorded without automatically becoming separate ordering choices.

### 2. Resolve the listed business decisions

Resolve the conflicting CT identifiers, jogger names/styles/prices, color ordering rules, socks SKU-to-design assignment and mixed minimum. Confirm which existing agent codes should see the Canadian Tire FMA catalog. Empty agent restrictions currently make a product visible to every active agent; do not treat that as a safe default for a dealer-specific catalog.

If socks allow selecting arbitrary mixes with a minimum of 48 gift packs, the existing fixed `unitsPerOrder` model cannot enforce that rule. Add an assortment group and server-side aggregate minimum/step validation, or obtain supplier confirmation of a fixed 48-pack assortment. Do not give every sock SKU a mandatory case of 48 without evidence.

### 3. Add the small schema and application extensions

Create an additive migration for explicit dealer pricing, unknown cost support, manufacturer code if retained structurally, and stable import/image mapping. Update product schema/types, repository mapping/save, admin form, catalog calculations and checkout. Preserve existing price fallback and historical snapshots. Run migrations explicitly, never during build.

### 4. Create a dedicated incremental FMA importer

Proposed entry point: `scripts/import-fma.mjs`, default dry run, explicit `--apply`. Report additions, matches, proposed updates, image bytes, blocked records and price/pack changes. Do not reuse `scripts/import-sheets.mjs`: it requires empty application tables and imports companies, stores, orders and counters. The FMA workbook has none of those migration tabs.

For first apply, insert resolved records as hidden. For a rerun, identify records by the stable mapping and perform no-op updates when data/image hashes match. Existing-product matches require an explicit reviewed mapping to UUID; reject ambiguous matches. Take a transaction/advisory lock, validate agent restrictions and image references, insert/link images and products, record before/after values and increment product versions only when changed. Refuse unresolved records by default; partial import needs an explicit list and report of exclusions.

No source order rows, stores, inventory quantities or emails should be generated from this template. No supplied catalog document establishes actual stock. The current database product model has status but no inventory count; case quantity is not stock.

### 5. Rehearse and verify

Use a separate test database with a copy of existing catalog mappings. Verify the hidden catalog and source reconciliation. Run appropriate domain/integration tests, typecheck and build after application changes. Required checks:

- Per-unit dealer/retail match resolved source values; known costs retain source precision.
- 1 and 2 cases produce correct units and totals; zero removes a cart entry; negative/fractional cases fail server validation.
- Queen comforter is $139.50 for one case using explicit dealer price, while existing fallback products keep their previous results.
- Quilt sets and sock gift packs are counted as sellable sets/packs, not their component pieces.
- Same-SKU shorts and jackets, ladies pants and men's joggers, and different manufacturer styles remain separate UUIDs and order lines.
- Agent restrictions work in listing and checkout; unavailable/hidden products cannot be submitted.
- Image files are readable, correct for the product, linked to existing image rows, within size limits, and reused on repeat imports.
- Importing twice creates no extra products/images; failure rolls back the batch; concurrent admin changes are detected rather than overwritten.
- Changing a product price or pack size later leaves historical order snapshots and order-edit pricing intact.

Workbook baseline before conflict resolution: setting K10:K40 to one case each independently computes **31 cases, 398 sellable units, $5,555.22 dealer total and $9,193.02 retail total**. This is a calculation fixture, not an order or a final corrected catalog total. Color expansion and corrected source values change final totals. Compare the app with the same selected products/quantities, not an all-products total after expansion.

### 6. Apply and publish the reviewed catalog

Take a database backup and save the dry-run manifest/report. Apply schema changes and the reviewed hidden catalog, then check product/image counts, sample orders, all conflicted resolutions and agent visibility. Publish only reviewed records by changing status to available. Capture the apply batch and final reconciliation report.

Rollback uses the batch mapping: archive newly inserted products and restore captured pre-import values for changed products with concurrency checks. Retain images referenced by products or later batches. Preserve orders and their snapshots. No blanket table deletion or replacement.

## Excel replacement gaps beyond catalog upload

The existing form already supports product quantity, calculated units/totals, agent/store lookup, contact/email, comments, persisted orders and review. The workbook's date corresponds to server order creation time; dealer/store identity maps to existing agent/store selection.

The workbook also has **customer PO/reference** and **phone**, neither of which has a dedicated current order field. The app-generated order reference is not the customer's PO. To replace the workbook fully, add optional customer PO and contact phone inputs, persist them on orders and include them in admin, email and export/print views. Keep comments for freeform notes. Verify the existing outputs show units and case/pack quantities clearly, and add manufacturer code/color/size to snapshots or product names where fulfillment needs them.

## Deliverables for implementation

1. Reviewed manifest, discrepancy resolutions and product image crops.
2. Additive migrations and shared pricing changes with focused regression coverage.
3. Dedicated dry-run/apply importer with stable mapping, deduplication, audit and rollback records.
4. Source-to-database reconciliation report and evidence that the order form matches the resolved Excel model.


## Updated PDF review - October 8, 2026

The current source is `data/Terra_Nova_FMA_Products_2026.pdf`; the original spaced filename remains as historical evidence. All 27 pages were compared by rendered pixels as well as extracted text. Only pages 1 and 2 changed: the cover is now portrait, and the sweater footer SKU is corrected from 6872209 to 6872709. All ten Northern Trek style records retain their existing product keys, prices, 36-item pack quantities and mapping rectangles. Pages 3-27 render identically. Historical order SKU snapshots remain unchanged.

## Assorted page ordering - October 9, 2026

The user superseded individual colour and style selection. The current manifest contains 27 products covering 26 product pages: one shipper-selected assortment per page, with Twin and Queen remaining separate on page 11. Every product page uses a whole-image click area. Page 2 orders one assorted 36-item sweater pack; page 13 orders one assorted four-set quilt case. The five quilt identifiers remain source metadata and a combined SKU string. All 31 Excel source rows remain reconciled via `source.excelRows` for the consolidated quilt page.

Local/test consolidation was applied and verified: 84 former colour/style products archived, 14 new assorted products added, two existing records updated, and 11 retained. Historical order lines remain unchanged. Production dry run matches these counts. Deploy the matching whole-page UI before applying production consolidation using `scripts/import-fma.ts --update --retire-missing --apply --publish`; run `scripts/verify-fma.ts` afterward. Do not use the obsolete 97-product verification counts for the consolidated catalogue.
