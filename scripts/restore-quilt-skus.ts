// Restore only the five individually ordered quilts; existing orders retain snapshots.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import labels from "../src/lib/fma-product-labels.json";
import { productSchema } from "../src/lib/domain";

const apply = process.argv.includes("--apply");
const testDatabase = process.argv.includes("--test");
const manifest = JSON.parse(
  await readFile("migration-data/fma-2026/manifest.json", "utf8"),
);
const quilts = manifest.products.filter((p: { key: string }) =>
  /^row-2[2-6]$/.test(p.key),
);
if (quilts.length !== 5) throw new Error("Expected exactly five quilts");
for (const [i, p] of quilts.entries()) {
  Object.assign(p, labels[p.key as keyof typeof labels] ?? {});
  productSchema.parse({ ...p, image: "", status: "available", agentCodes: [] });
  if (
    p.key !== `row-${22 + i}` ||
    p.source.ctSkus[0] !== String(6463181 + i) ||
    p.unitsPerOrder !== 4 ||
    p.source.pdfPage !== 13
  )
    throw new Error("Unexpected quilt identity or case quantity");
}
const databaseUrl = testDatabase
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Selected database URL required");
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
});
try {
  await sql.begin(async (tx) => {
    const companies =
      await tx`select id from terranova.companies where name='Canadian Tire'`;
    if (companies.length !== 1)
      throw new Error("Expected one Canadian Tire company");
    const company = companies[0];
    const records = [];
    for (const p of quilts) {
      const rows =
        await tx`select p.* from terranova.products p left join terranova.catalog_imports ci on ci.product_id=p.id where p.company_id=${company.id} and (ci.catalog_key='fma-2026' and ci.product_key=${p.key} or p.sku=${p.source.ctSkus[0]}) for update of p`;
      if (rows.length !== 1)
        throw new Error(`Ambiguous existing quilt ${p.sku}`);
      const row = rows[0];
      if (row.restricted || row.status !== "available")
        throw new Error("Unexpected quilt availability");
      const images =
        await tx`select image_id from terranova.image_imports where checksum=${p.imageSha256}`;
      if (images.length !== 1) throw new Error("Missing original quilt image");
      records.push({ p, row, image: `/api/images/${images[0].image_id}` });
    }
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          quilts: records.map(({ p, row }) => ({
            id: row.id,
            sku: p.sku,
            style: p.style,
            wasArchived: row.archived,
          })),
        },
        null,
        2,
      ),
    );
    if (!apply) return;
    const mappings =
      await tx`select * from terranova.catalog_imports where catalog_key='fma-2026' and product_key in ('row-22','row-23','row-24','row-25','row-26')`;
    await writeFile(
      `migration-data/fma-2026/before-quilt-restore-${Date.now()}.json`,
      JSON.stringify(
        { products: records.map((r) => r.row), mappings },
        null,
        2,
      ),
      { flag: "wx" },
    );
    for (const { p, row, image } of records) {
      const values = {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        style: p.style,
        description: p.description,
        cost: p.cost,
        dealer_price: p.dealerPrice,
        srp: p.srp,
        order_unit: p.orderUnit,
        units_per_order: p.unitsPerOrder,
        unit_label: p.unitLabel,
        minimum_order: p.minimumOrder,
        image,
        archived: false,
      };
      const updated =
        await tx`update terranova.products set ${tx(values)},version=version+1,updated_at=now() where id=${row.id} and version=${row.version} returning id`;
      if (updated.length !== 1) throw new Error("Concurrent quilt change");
      const checksum = createHash("sha256")
        .update(JSON.stringify(p))
        .digest("hex");
      await tx`insert into terranova.catalog_imports (catalog_key,product_key,product_id,checksum,source) values ('fma-2026',${p.key},${row.id},${checksum},${tx.json(p.source)}) on conflict (catalog_key,product_key) do update set product_id=excluded.product_id,checksum=excluded.checksum,source=excluded.source`;
      await tx`insert into terranova.audit_events (actor,action,entity_id,details) values ('quilt-sku-restore','catalog.product.restored',${row.id},${tx.json({ sku: p.sku, key: p.key })})`;
    }
  });
} finally {
  await sql.end();
}
