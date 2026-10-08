import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { productSchema, productAmounts } from "../src/lib/domain";

const args = process.argv.slice(2),
  apply = args.includes("--apply");
const publish = args.includes("--publish");
const update = args.includes("--update");
const manifestPath = resolve(
  args.find((x) => x.endsWith(".json")) ||
    "migration-data/fma-2026/manifest.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const hash = (v: Buffer | string) =>
  createHash("sha256").update(v).digest("hex");
if (manifest.catalogKey !== "fma-2026" || manifest.company !== "Canadian Tire")
  throw new Error("Unexpected catalog/company");
const keys = new Set<string>();
const prepared = [];
for (const raw of manifest.products) {
  if (keys.has(raw.key)) throw new Error("Duplicate product key");
  keys.add(raw.key);
  if (raw.imageFile.includes("/") || raw.imageFile.includes(".."))
    throw new Error("Invalid image filename");
  const bytes = await readFile(resolve(dirname(manifestPath), raw.imageFile));
  if (
    bytes.length > 2097152 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    hash(bytes) !== raw.imageSha256
  )
    throw new Error(`Invalid image: ${raw.key}`);
  const product = productSchema.parse({
    ...raw,
    image: "",
    status: "available",
    agentCodes: [],
  });
  if (product.dealerPrice == null)
    throw new Error("Published dealer price required");
  prepared.push({ raw, product, bytes, checksum: hash(JSON.stringify(raw)) });
}
if (new Set(prepared.map((p) => p.raw.source.excelRow)).size !== 31)
  throw new Error("Missing source rows");
const url = args.includes("--test")
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL;
if (!url) throw new Error("Selected database is not configured");
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  const [company] =
    await sql`select id,name from terranova.companies where lower(trim(name))='canadian tire'`;
  if (!company) throw new Error("Canadian Tire company does not exist");
  const [schema] =
    await sql`select to_regclass('terranova.catalog_imports') as present`;
  if (!schema.present)
    throw new Error("Run migration 004 on the selected database first");
  const mappings =
    await sql`select ci.*,p.version,p.archived,p.status from terranova.catalog_imports ci join terranova.products p on p.id=ci.product_id where catalog_key=${manifest.catalogKey}`;
  const conflicts = prepared.filter((p) =>
    mappings.some(
      (m) =>
        m.product_key === p.raw.key &&
        ((m.checksum !== p.checksum && !update) || m.archived),
    ),
  );
  if (conflicts.length)
    throw new Error(
      "Existing import differs or was archived; review updates explicitly: " +
        conflicts.map((p) => p.raw.key).join(", "),
    );
  const report = {
    mode: apply ? "apply" : "dry-run",
    importedStatus: publish ? "available" : "hidden",
    target: args.includes("--test") ? "test" : "configured database",
    company: company.name,
    products: prepared.length,
    additions: prepared.filter(
      (p) => !mappings.some((m) => m.product_key === p.raw.key),
    ).length,
    updates: prepared.filter((p) =>
      mappings.some(
        (m) => m.product_key === p.raw.key && m.checksum !== p.checksum,
      ),
    ).length,
    unchanged: prepared.filter((p) =>
      mappings.some(
        (m) => m.product_key === p.raw.key && m.checksum === p.checksum,
      ),
    ).length,
    uniqueImages: new Set(prepared.map((p) => p.raw.imageSha256)).size,
    sourceRows: 31,
    minimumSelectionUnits: prepared.reduce(
      (s, p) => s + p.product.unitsPerOrder * (p.product.minimumOrder ?? 1),
      0,
    ),
    minimumSelectionDealer:
      prepared.reduce(
        (s, p) =>
          s +
          Math.round(
            productAmounts(
              p.product,
              p.product.unitsPerOrder * (p.product.minimumOrder ?? 1),
            ).lineDealer * 100,
          ),
        0,
      ) / 100,
  };
  if (apply) {
    // Before-state backup is local and contains business data, never credentials.
    const backup = await sql`select p.* from terranova.products p`;
    await writeFile(
      resolve(
        dirname(manifestPath),
        `before-${args.includes("--test") ? "test" : "apply"}-${Date.now()}.json`,
      ),
      JSON.stringify(
        { savedAt: new Date().toISOString(), products: backup, mappings },
        null,
        2,
      ),
      { flag: "wx" },
    ).catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(872391101)`;
      for (const { raw, product: p, bytes, checksum } of prepared) {
        const [old] =
          await tx`select * from terranova.catalog_imports where catalog_key=${manifest.catalogKey} and product_key=${raw.key}`;
        const expected = mappings.find((m) => m.product_key === raw.key);
        if (old && (!expected || old.checksum !== expected.checksum))
          throw new Error("Concurrent import conflict");
        if (old && old.checksum === checksum) {
          if (publish) {
            const [current] =
              await tx`select * from terranova.products where id=${old.product_id} for update`;
            if (
              !current ||
              current.archived ||
              current.company_id !== company.id ||
              current.restricted ||
              current.name !== p.name ||
              current.sku !== p.sku ||
              current.barcode !== p.barcode ||
              current.style !== p.style ||
              Number(current.dealer_price) !== p.dealerPrice ||
              Number(current.srp) !== p.srp ||
              (current.cost == null ? null : Number(current.cost)) !== p.cost ||
              current.units_per_order !== p.unitsPerOrder ||
              current.minimum_order !== (p.minimumOrder ?? 1)
            )
              throw new Error(
                `Product ${raw.key} changed since import; reconcile before publication`,
              );
            const [promoted] =
              await tx`update terranova.products set status='available',version=version+1,updated_at=now() where id=${old.product_id} and status='hidden' and version=${expected!.version} returning id`;
            if (promoted)
              await tx`insert into terranova.audit_events (actor,action,entity_id,details) values ('fma-import','catalog.product.published',${promoted.id},${tx.json({ catalog: manifest.catalogKey, key: raw.key })})`;
          }
          continue;
        }
        if (old && !update) throw new Error("Explicit --update required");
        let [image] =
          await tx`select image_id as id from terranova.image_imports where checksum=${raw.imageSha256}`;
        if (!image) {
          [image] =
            await tx`insert into terranova.images (content_type,data) values ('image/jpeg',${bytes}) returning id`;
          await tx`insert into terranova.image_imports (checksum,image_id) values (${raw.imageSha256},${image.id})`;
        }
        const values = {
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          cost: p.cost,
          dealer_price: p.dealerPrice!,
          srp: p.srp,
          order_unit: p.orderUnit,
          units_per_order: p.unitsPerOrder,
          unit_label: p.unitLabel,
          category: p.category,
          style: p.style,
          description: p.description,
          image: `/api/images/${image.id}`,
          minimum_order: p.minimumOrder ?? 1,
          company_id: company.id,
          status: publish ? "available" : (expected?.status ?? "hidden"),
          restricted: false,
        };
        const [created] = old
          ? await tx`update terranova.products set ${tx(values)},version=version+1,updated_at=now() where id=${old.product_id} and version=${expected!.version} and not archived returning id`
          : await tx`insert into terranova.products ${tx(values)} returning id`;
        if (!created)
          throw new Error("Product changed during import; retry after review");
        if (old)
          await tx`update terranova.catalog_imports set checksum=${checksum},source=${tx.json(raw.source)} where catalog_key=${manifest.catalogKey} and product_key=${raw.key}`;
        else
          await tx`insert into terranova.catalog_imports (catalog_key,product_key,product_id,checksum,source) values (${manifest.catalogKey},${raw.key},${created.id},${checksum},${tx.json(raw.source)})`;
        await tx`insert into terranova.audit_events (actor,action,entity_id,details) values ('fma-import','catalog.product.imported',${created.id},${tx.json({ catalog: manifest.catalogKey, key: raw.key, checksum, image: raw.imageSha256, sources: manifest.sources })})`;
      }
    });
  }
  await writeFile(
    resolve(
      dirname(manifestPath),
      `report-${args.includes("--test") ? "test" : "database"}-${apply ? "apply" : "dry-run"}.json`,
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end();
}
