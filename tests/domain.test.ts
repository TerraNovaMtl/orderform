import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineAmounts,
  snapshotAmounts,
  sumMoney,
  csvCell,
  orderSchema,
  productSchema,
  codeSchema,
} from "../src/lib/domain";
test("cost markup retains fractional cents until the line total", () => {
  assert.deepEqual(lineAmounts(1.25, 3, 12), {
    dealerUnit: 1.3875000000000002,
    lineDealer: 16.65,
    lineRetail: 36,
  });
  assert.equal(lineAmounts(0.01, 0.02, 100).lineDealer, 1.11);
});
test("order edits use historical prices instead of catalog prices", () => {
  assert.deepEqual(snapshotAmounts("1.387500", "3.0000", 18), {
    lineDealer: 24.98,
    lineRetail: 54,
  });
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
});
test("CSV neutralizes formula cells and escapes quotes", () => {
  assert.equal(csvCell(" =SUM(A1:A2)"), `"' =SUM(A1:A2)"`);
  assert.equal(csvCell('a,"b"'), `"a,""b"""`);
});
test("codes preserve leading zeros and normalize case", () => {
  assert.equal(codeSchema.parse(" 00a "), "00A");
  assert.equal(codeSchema.safeParse("<script>").success, false);
});
test("orders reject duplicate products, fractions and negative quantities", () => {
  const id = "cae0140c-c647-4b1e-9335-0d2133dd37e1";
  const p = {
    vendorCode: "AGENT",
    storeCode: "001",
    comments: "",
    idempotencyKey: id,
    lines: [{ productId: id, qty: 1 }],
  };
  assert.equal(orderSchema.safeParse(p).success, true);
  for (const qty of [-1, 0, 1.5, 100001])
    assert.equal(
      orderSchema.safeParse({ ...p, lines: [{ productId: id, qty }] }).success,
      false,
    );
  assert.equal(
    orderSchema.safeParse({ ...p, lines: [...p.lines, ...p.lines] }).success,
    false,
  );
});
test("products reject executable image URLs and invalid money", () => {
  const p = {
    name: "Test",
    sku: "",
    barcode: "",
    cost: 1,
    srp: 2,
    orderUnit: "case",
    unitsPerOrder: 6,
    unitLabel: "items",
    category: "Test",
    style: "",
    description: "",
    image: "",
    status: "available",
    agentCodes: [],
  };
  assert.equal(productSchema.safeParse(p).success, true);
  assert.equal(
    productSchema.safeParse({ ...p, image: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(productSchema.safeParse({ ...p, cost: -1 }).success, false);
});
