import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
function dryRun(value: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "terranova-import-")),
    file = join(dir, "fixture.json");
  try {
    writeFileSync(file, JSON.stringify(value));
    return spawnSync(process.execPath, ["scripts/import-sheets.mjs", file], {
      encoding: "utf8",
    });
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
}
const source = {
  Products: [
    {
      id: "001",
      name: "Product",
      cost: 1.25,
      srp: 3,
      unitsPerOrder: 6,
      vendorCodes: '["AGENT001"]',
    },
  ],
  Vendors: [
    {
      code: "AGENT001",
      company: "Company",
      storeCode: "",
      firstName: "Agent",
      lastName: "Name",
      email: "agent@example.invalid",
    },
    {
      code: "AGENT001",
      company: "Company",
      storeCode: "001",
      firstName: "Store",
      lastName: "Contact",
      email: "store@example.invalid",
    },
  ],
  Orders: [
    {
      "Order ID": "TN-20260101-1200-0001",
      Date: "2026-01-01 12:00",
      Product: "Product",
      "Order Qty": 2,
      "Total Units": 12,
      "Dealer/Unit ($)": 1.3875,
      "SRP/Unit ($)": 3,
      "Line Dealer ($)": 16.65,
      "Line SRP ($)": 36,
    },
    {
      "Order ID": "TN-20260101-1200-0001 — TOTAL",
      Date: "2026-01-01 12:00",
      "Vendor Code": "AGENT001",
      "Order Qty": 2,
      "Total Units": 12,
      "Line Dealer ($)": 16.65,
      "Line SRP ($)": 36,
    },
  ],
  Counter: 1,
};
test("sheet import dry run reconciles source totals without a database write", () => {
  const r = dryRun(source);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run only/);
  assert.match(r.stdout, /"orders": 1/);
});
test("sheet import rejects broken totals and duplicate store identities", () => {
  const bad = structuredClone(source);
  bad.Orders[1]["Line Dealer ($)"] = 1;
  bad.Vendors.push({ ...bad.Vendors[1] });
  const r = dryRun(bad);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /does not reconcile/);
  assert.match(r.stdout, /Duplicate agent\/store pair/);
});
test("sheet import rejects missing TOTAL rows and broken product restrictions", () => {
  const bad = structuredClone(source);
  bad.Orders.pop();
  bad.Products[0].vendorCodes = '["UNKNOWN"]';
  const r = dryRun(bad);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /lacks lines or TOTAL/);
  assert.match(r.stdout, /missing agent/);
});
