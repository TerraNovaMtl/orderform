import { test } from "node:test";
import assert from "node:assert/strict";
import { toDealerProduct, toDealerOrder } from "../src/lib/dealer-responses";
import { productAmounts, type Product, type Order } from "../src/lib/domain";

const product: Product = {
  id: "hoodie",
  version: 1,
  name: "Men's Fleece Hoodies",
  sku: "6872227",
  barcode: "",
  cost: 14.43,
  dealerPrice: null,
  srp: 29.99,
  orderUnit: "case",
  unitsPerOrder: 24,
  unitLabel: "items",
  category: "Men's Apparel",
  style: "Hoodie",
  description: "",
  image: "",
  status: "available",
  agentCodes: [],
};

test("dealer catalogue JSON omits cost while retaining exact selling prices and totals", () => {
  for (const original of [
    product,
    { ...product, dealerPrice: 19.98 },
    { ...product, cost: null, dealerPrice: 23.31 },
  ]) {
    const visible = toDealerProduct(original);
    assert.equal(Object.hasOwn(visible, "cost"), false);
    assert.equal(JSON.stringify(visible).includes('"cost"'), false);
    assert.deepEqual(productAmounts(visible, 24), productAmounts(original, 24));
  }
  assert.equal(product.cost, 14.43);
  assert.equal(
    toDealerProduct({
      ...product,
      internalNote: "private",
    } as Product).hasOwnProperty("internalNote"),
    false,
  );
});

test("dealer order JSON omits all line costs without mutating admin snapshots", () => {
  const order: Order = {
    id: "order",
    reference: "TN-001-0001",
    version: 1,
    date: "2026-10-15",
    company: "Company",
    agentCode: "AGENT",
    agentName: "Agent",
    storeCode: "001",
    contactName: "Contact",
    customerEmail: "test@example.com",
    comments: "",
    orderSent: false,
    invoiceSent: false,
    paymentReceived: false,
    cancelled: false,
    totalDealer: 32,
    totalRetail: 60,
    lines: [14.43, null].map((cost, index) => ({
      id: `line-${index}`,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      barcode: "",
      orderUnit: "case",
      unitLabel: "items",
      unitsPerOrder: 1,
      qty: 1,
      cost,
      dealerUnit: 16,
      srpUnit: 30,
      lineDealer: 16,
      lineRetail: 30,
    })),
  };
  const result = toDealerOrder(order);
  assert.equal(JSON.stringify(result).includes('"cost"'), false);
  for (const line of result.lines)
    assert.equal(Object.hasOwn(line, "cost"), false);
  assert.equal(result.totalDealer, order.totalDealer);
  assert.equal(result.lines[0].dealerUnit, order.lines[0].dealerUnit);
  assert.equal(order.lines[0].cost, 14.43);
  assert.equal(order.lines[1].cost, null);
});
