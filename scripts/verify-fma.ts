import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { productAmounts } from "../src/lib/domain";
const test = process.argv.includes("--test");
const url = test ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) throw new Error("Selected database not configured");
const sql = postgres(url, { max: 1, prepare: false });
const manifest = JSON.parse(
  await readFile("migration-data/fma-2026/manifest.json", "utf8"),
);
try {
  const rows =
    await sql`select p.*,ci.product_key,c.name as company,i.data from terranova.catalog_imports ci join terranova.products p on p.id=ci.product_id join terranova.companies c on c.id=p.company_id join terranova.images i on '/api/images/'||i.id::text=p.image where ci.catalog_key=${manifest.catalogKey}`;
  assert.equal(rows.length, manifest.products.length);
  for (const raw of manifest.products) {
    const p = rows.find((r) => r.product_key === raw.key);
    assert.ok(p, raw.key);
    assert.equal(p.company, "Canadian Tire");
    for (const [key, column] of Object.entries({
      name: "name",
      sku: "sku",
      barcode: "barcode",
      style: "style",
      description: "description",
      orderUnit: "order_unit",
      unitLabel: "unit_label",
    }))
      assert.equal(p[column], raw[key], `${raw.key} ${key}`);
    for (const [key, column] of Object.entries({
      dealerPrice: "dealer_price",
      srp: "srp",
      unitsPerOrder: "units_per_order",
      minimumOrder: "minimum_order",
    }))
      assert.equal(Number(p[column]), raw[key], `${raw.key} ${key}`);
    assert.equal(p.cost == null ? null : Number(p.cost), raw.cost);
    assert.equal(
      createHash("sha256").update(p.data).digest("hex"),
      raw.imageSha256,
    );
  }
  const queen = manifest.products.find((p) => p.key === "row-20");
  assert.equal(productAmounts(queen, 6).lineDealer, 139.5);
  const socks = manifest.products.find((p) => p.key === "row-14");
  assert.equal(productAmounts(socks, 48).lineDealer, 266.4);
  const sweaters = rows.filter(
    (p) =>
      p.product_key === "row-10" || p.product_key.startsWith("row-10-style-"),
  );
  assert.equal(sweaters.length, 10);
  assert.deepEqual(
    sweaters.map((p) => p.style).sort(),
    [
      "7271MNT",
      "7273MNT",
      "7270MNT",
      "7266MNT",
      "7267MNT",
      "7272MNT",
      "7268MNT",
      "7274MNT",
      "7269MNT",
      "7264MNT",
    ].sort(),
  );
  for (const sweater of sweaters) {
    assert.equal(sweater.units_per_order, 36);
    assert.equal(sweater.order_unit, "pack");
    assert.equal(sweater.sku, "6872709");
    assert.equal(
      productAmounts(
        {
          cost: null,
          dealerPrice: Number(sweater.dealer_price),
          srp: Number(sweater.srp),
        },
        36,
      ).lineDealer,
      719.28,
    );
  }
  const backup = JSON.parse(
    await readFile(
      `migration-data/fma-2026/before-${test ? "test" : "apply"}.json`,
      "utf8",
    ).catch(() => '{"products":[]}'),
  );
  let existingProductsUnchanged = 0;
  if (!test) {
    const current = await sql`select * from terranova.products`;
    for (const previous of backup.products) {
      if (
        previous.name.startsWith("BROWSER-") ||
        previous.name === "Cotton bedding set"
      )
        continue;
      const actual = current.find((p) => p.id === previous.id);
      assert.ok(actual, "Existing product was removed");
      assert.deepEqual(
        JSON.parse(JSON.stringify(actual)),
        previous,
        "Existing product was modified",
      );
      existingProductsUnchanged++;
    }
  }
  const report = {
    existingProductsUnchanged,
    database: test ? "test" : "main",
    verifiedProducts: rows.length,
    verifiedImages: rows.length,
    sourceRows: new Set(manifest.products.map((p) => p.source.excelRow)).size,
    statuses: rows.reduce(
      (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
      {},
    ),
    queenCaseDealer: 139.5,
    socksMinimumDealer: 266.4,
    sweaterStylePacks: sweaters.length,
    sweaterPackDealer: 719.28,
  };
  await writeFile(
    `migration-data/fma-2026/verification-${test ? "test" : "main"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end();
}
