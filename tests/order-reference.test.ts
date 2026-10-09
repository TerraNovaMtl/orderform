import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReference } from "../src/lib/order-reference";
test("order references preserve store numbers and support four to five counter digits", () => {
  assert.equal(orderReference("00123", 1), "TN-00123-0001");
  assert.equal(orderReference("ABCABC", 9999), "TN-ABCABC-9999");
  assert.equal(orderReference("00123", 10000), "TN-00123-10000");
  assert.equal(orderReference("00123", 99999), "TN-00123-99999");
  for (const n of [0, -1, 100000, 1.5])
    assert.throws(() => orderReference("00123", n));
});
