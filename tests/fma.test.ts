import { test } from "node:test";
import assert from "node:assert/strict";
import {
  productAmounts,
  lineAmounts,
  productSchema,
  orderSchema,
} from "../src/lib/domain";
test("published dealer price overrides markup and unknown cost is retained", () => {
  assert.equal(
    productAmounts({ cost: 20.95, dealerPrice: 23.25, srp: 34.99 }, 6)
      .lineDealer,
    139.5,
  );
  assert.equal(
    productAmounts({ cost: null, dealerPrice: 5.55, srp: 9.99 }, 48).lineDealer,
    266.4,
  );
  assert.deepEqual(
    productAmounts({ cost: 1.25, srp: 3 }, 12),
    lineAmounts(1.25, 3, 12),
  );
});
test("checkout retains optional PO and phone with idempotency input", () => {
  const p = orderSchema.parse({
    vendorCode: "AGENT",
    storeCode: "001",
    comments: "note",
    customerPo: " PO-001 ",
    contactPhone: " 555-0100 ",
    idempotencyKey: "cae0140c-c647-4b1e-9335-0d2133dd37e1",
    lines: [{ productId: "cae0140c-c647-4b1e-9335-0d2133dd37e1", qty: 4 }],
  });
  assert.equal(p.customerPo, "PO-001");
  assert.equal(p.contactPhone, "555-0100");
});
test("product requires a known price basis and valid minimum", () => {
  const p = {
    name: "Socks",
    sku: "",
    barcode: "",
    cost: null,
    dealerPrice: 5.55,
    srp: 9.99,
    orderUnit: "pack",
    unitsPerOrder: 12,
    unitLabel: "gift packs",
    category: "Kids",
    style: "",
    description: "",
    image: "",
    status: "available",
    agentCodes: [],
    minimumOrder: 4,
  };
  assert.equal(productSchema.safeParse(p).success, true);
  assert.equal(
    productSchema.safeParse({ ...p, dealerPrice: null }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...p, minimumOrder: 0 }).success,
    false,
  );
});
