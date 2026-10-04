import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(872391101)`;
    await tx`create schema if not exists terranova`;
    await tx`create table if not exists terranova.schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    for (const name of (await readdir("migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      const source = await readFile(`migrations/${name}`, "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const [old] =
        await tx`select checksum from terranova.schema_migrations where name=${name}`;
      if (old) {
        if (old.checksum !== checksum)
          throw new Error(`Changed applied migration: ${name}`);
        continue;
      }
      await tx.unsafe(source);
      await tx`insert into terranova.schema_migrations (name, checksum) values (${name}, ${checksum})`;
      console.log("Applied", name);
    }
  });
  console.log("Database migrations complete.");
} catch (e) {
  console.error("Migration failed:", e.code || e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
