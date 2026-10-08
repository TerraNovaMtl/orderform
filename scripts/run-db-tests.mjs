import { spawnSync } from "node:child_process";
if (
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL_TEST === process.env.DATABASE_URL
)
  throw new Error("A separate test database is required");
const result = spawnSync(
  process.execPath,
  ["--import=tsx", "--test", "tests/integration.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL_TEST,
      RUN_DB_TESTS: "1",
    },
  },
);
process.exitCode = result.status ?? 1;
