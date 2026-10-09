import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  resizeEmailThumbnail,
  type EmailThumbnail,
} from "../src/lib/email-thumbnails";
import { renderOrderEmail } from "../src/lib/order-email";
import type { Order } from "../src/lib/domain";

const order: Order = {
  id: "order",
  reference: "TN-001-0001",
  version: 1,
  date: "2026-10-09T12:00:00Z",
  company: "Canadian Tire",
  agentCode: "AGENT",
  agentName: "Agent",
  storeCode: "001",
  contactName: "Store contact",
  customerEmail: "test@example.com",
  comments: "",
  orderSent: false,
  invoiceSent: false,
  paymentReceived: false,
  cancelled: false,
  totalDealer: 24,
  totalRetail: 48,
  lines: [
    {
      id: "line-1",
      productId: "product",
      name: 'Throw <Blue> & "White"',
      sku: "123&456",
      barcode: "",
      orderUnit: "case",
      unitLabel: "items",
      unitsPerOrder: 12,
      cost: 1,
      dealerUnit: 2,
      srpUnit: 4,
      qty: 1,
      lineDealer: 24,
      lineRetail: 48,
    },
  ],
};

test("email thumbnails preserve the full image aspect ratio and stay small", async () => {
  const input = await sharp({
    create: { width: 400, height: 600, channels: 4, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const thumbnail = await resizeEmailThumbnail(input);
  const metadata = await sharp(
    Buffer.from(thumbnail.content, "base64"),
  ).metadata();
  assert.equal(metadata.width, 96);
  assert.equal(metadata.height, 144);
  assert.equal(metadata.format, "jpeg");
  assert.equal(thumbnail.width, 48);
  assert.equal(thumbnail.height, 72);
  assert.ok(Buffer.byteLength(thumbnail.content, "base64") < 10000);
});

test("order email embeds each line thumbnail, retains SKU and right aligned totals", () => {
  const thumbnail: EmailThumbnail = {
    lineId: "line-1",
    cid: "product-line-1",
    filename: "product-line-1.jpg",
    content: "",
    encoding: "base64",
    contentType: "image/jpeg",
    width: 48,
    height: 72,
  };
  const html = renderOrderEmail(order, [thumbnail]);
  assert.match(html, /src="cid:product-line-1"/);
  assert.match(html, /width="48" height="72"/);
  assert.match(html, /Throw &lt;Blue&gt; &amp; &quot;White&quot;/);
  assert.match(html, /SKU: 123&amp;456/);
  assert.match(html, /text-align:right;white-space:nowrap;">\$24\.00/);
  assert.match(
    html,
    /font-size:24px;font-weight:700;white-space:nowrap;">\$24\.00/,
  );
});

test("orders without an available product image still render complete lines", () => {
  const html = renderOrderEmail(order);
  assert.doesNotMatch(html, /cid:product-/);
  assert.match(html, /SKU: 123&amp;456/);
  assert.match(html, /1 case/);
});
