import postgres from "postgres";
let client: ReturnType<typeof postgres> | undefined;
// Local `next dev` uses the test database when DATABASE_URL_TEST is set.
function databaseUrl() {
  if (process.env.NODE_ENV === "development" && process.env.DATABASE_URL_TEST)
    return process.env.DATABASE_URL_TEST;
  return process.env.DATABASE_URL;
}
export function db() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not configured");
  return (client ??= postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}
export type Tx = postgres.TransactionSql;
