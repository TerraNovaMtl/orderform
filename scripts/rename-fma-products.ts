import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import labels from "../src/lib/fma-product-labels.json";

const apply = process.argv.includes("--apply");
const test = process.argv.includes("--test");
const url = test ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) throw new Error("Selected database is not configured");
const manifestPath = "migration-data/fma-2026/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(apply ? "read write" : "read only", async (tx) => {
    const rows =
      await tx`select p.*,ci.product_key,ci.checksum,ci.source from terranova.products p join terranova.catalog_imports ci on ci.product_id=p.id where ci.catalog_key='fma-2026' and ci.product_key in ${tx(Object.keys(labels))} ${apply ? tx`for update of p,ci` : tx``}`;
    if (rows.length !== Object.keys(labels).length)
      throw new Error("Missing or ambiguous product mappings");
    const changes = rows.map((row) => {
      const label = labels[row.product_key as keyof typeof labels];
      const raw = manifest.products.find(
        (p: { key: string }) => p.key === row.product_key,
      );
      if (
        !raw ||
        row.archived ||
        row.sku.split(" / ")[0] !== label.sku.split(" / ")[0]
      )
        throw new Error(`Unexpected product identity: ${row.product_key}`);
      if (
        row.name !== raw.name &&
        row.name !== label.name &&
        row.name !== row.source?.excelValues?.[2]
      )
        throw new Error(
          `Product name changed since manifest: ${row.product_key}`,
        );
      const updated = { ...raw, ...label };
      return {
        row,
        label,
        updated,
        checksum: createHash("sha256")
          .update(JSON.stringify(updated))
          .digest("hex"),
      };
    });
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          target: test ? "test" : "configured database",
          products: changes.map(({ row, label }) => ({
            key: row.product_key,
            before: row.name,
            ...label,
          })),
        },
        null,
        2,
      ),
    );
    if (!apply) return;
    await writeFile(
      `migration-data/fma-2026/before-product-labels-${test ? "test" : "main"}-${Date.now()}.json`,
      JSON.stringify(rows, null, 2),
      { flag: "wx" },
    );
    for (const { row, label, checksum } of changes) {
      if (row.name !== label.name || row.sku !== label.sku) {
        const result =
          await tx`update terranova.products set name=${label.name},sku=${label.sku},version=version+1,updated_at=now() where id=${row.id} and version=${row.version} returning id`;
        if (result.length !== 1) throw new Error("Concurrent product change");
        await tx`insert into terranova.audit_events(actor,action,entity_id,details) values ('product-label-update','catalog.product.renamed',${row.id},${tx.json({ key: row.product_key, before: { name: row.name, sku: row.sku }, after: label })})`;
      }
      await tx`update terranova.catalog_imports set checksum=${checksum} where catalog_key='fma-2026' and product_key=${row.product_key}`;
    }
  });
  if (apply) {
    for (const raw of manifest.products)
      Object.assign(raw, labels[raw.key as keyof typeof labels] ?? {});
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
} finally {
  await sql.end();
}
