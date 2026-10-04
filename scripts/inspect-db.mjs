import postgres from "postgres";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const url = new URL(process.env.DATABASE_URL);
console.log(
  "Database provider:",
  url.hostname.includes("neon")
    ? "Neon"
    : url.hostname.includes("supabase")
      ? "Supabase"
      : "PostgreSQL",
);
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
});
try {
  const tables =
    await sql`select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1,2`;
  console.log(JSON.stringify({ connected: true, tables }, null, 2));
} catch (e) {
  console.error("Database inspection failed:", e.code || "connection error");
  process.exitCode = 1;
} finally {
  await sql.end();
}
