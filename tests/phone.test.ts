import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPhone } from "../src/lib/phone";
import { orderSchema, editOrderSchema } from "../src/lib/domain";

test("optional phone accepts common formats and rejects malformed numbers", () => {
  for (const phone of [
    "",
    "  ",
    "514-555-0123",
    "+1 (514) 555-0123",
    "+44 20 7946 0958",
    "514.555.0123 ext. 123",
    "5145550123 x42",
  ])
    assert.equal(isValidPhone(phone), true, phone);
  for (const phone of [
    "123",
    "call me",
    "514-ABC-0123",
    "++15145550123",
    "1234567890123456",
    "5145550123 ext.",
  ])
    assert.equal(isValidPhone(phone), false, phone);
});

test("new and edited orders enforce phone validation on the server", () => {
  for (const schema of [orderSchema, editOrderSchema]) {
    const phone = schema.shape.contactPhone;
    assert.equal(phone.safeParse("invalid").success, false);
    assert.equal(phone.safeParse("514-555-0123").success, true);
    assert.equal(phone.safeParse(undefined).success, true);
  }
});
