import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { saveAgent, saveProduct } from "../src/lib/repository";
import { encode } from "next-auth/jwt";
if (
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL_TEST === process.env.DATABASE_URL
)
  throw new Error("Separate test database required");
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
const suffix = randomUUID().slice(0, 8).toUpperCase(),
  code = `BROWSER-${suffix}`,
  company = `BROWSER-${suffix}`,
  actor = `browser-${suffix}`;
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3020";
let productId = "",
  browser;
try {
  await saveAgent(
    {
      company,
      code,
      firstName: "Morgan",
      lastName: "Lee",
      email: "",
      active: true,
    },
    actor,
  );
  ({ id: productId } = await saveProduct(
    {
      name: "Cotton bedding set",
      sku: "BED-001",
      barcode: "00001234",
      cost: 24.5,
      srp: 49.99,
      orderUnit: "case",
      unitsPerOrder: 6,
      unitLabel: "sets",
      category: "Beddings",
      style: "Natural",
      description: "Soft cotton bedding in a warm neutral palette.",
      image: "/images/image1.png",
      status: "available",
      agentCodes: [code],
    },
    actor,
  ));
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("test-results", { recursive: true });
  await page.goto(base);
  await page.getByText("Please contact your vendor for access.").waitFor();
  await page.screenshot({
    path: "test-results/access-desktop.png",
    fullPage: true,
  });
  assert.equal((await page.request.get(`${base}/api/admin`)).status(), 401);
  assert.equal((await page.request.get(`${base}/api/catalog`)).status(), 400);
  await page.goto(`${base}/?vendor=INVALID-CODE`);
  await page
    .getByText("Please contact your vendor for a valid company-agent link.")
    .waitFor();
  await page.goto(`${base}/?vendor=${code}`);
  await page.getByLabel("Store code", { exact: true }).fill("001");
  await page.getByRole("button", { name: "Continue →", exact: true }).click();
  await page.getByRole("heading", { name: "Create your store" }).waitFor();
  await page.getByLabel("First name", { exact: true }).fill("Jamie");
  await page.getByLabel("Last name", { exact: true }).fill("Buyer");
  await page
    .getByLabel("Email", { exact: true })
    .fill("browser@example.invalid");
  await page.getByRole("button", { name: "Save and view catalog" }).click();
  await page.getByRole("heading", { name: "Stock your shelves." }).waitFor();
  await page
    .getByRole("button", { name: "Add Cotton bedding set to cart" })
    .click();
  await page
    .getByRole("button", { name: "Increase quantity for Cotton bedding set" })
    .click();
  await page.getByLabel("PO number (optional)").fill("PO-BROWSER");
  await page.getByLabel("Phone (optional)").fill("555-0100");
  await page.getByLabel("Order notes").fill("Browser test order");
  await page.screenshot({
    path: "test-results/catalog-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Review order →" }).click();
  await page.getByRole("button", { name: "Confirm and submit order" }).click();
  await page
    .getByText("Your order has been recorded.", { exact: false })
    .waitFor();
  await page.screenshot({
    path: "test-results/receipt-desktop.png",
    fullPage: true,
  });
  const [o] =
    await db()`select * from terranova.orders where agent_code=${code}`;
  assert.equal(Number(o.total_dealer), 326.34);
  assert.equal(o.customer_po, "PO-BROWSER");
  assert.equal(o.contact_phone, "555-0100");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^terranova-TN-/);
  await page.getByRole("button", { name: "Start another order" }).click();
  await page.getByRole("button", { name: "Change store" }).click();
  await page.getByLabel("Store code", { exact: true }).fill("001");
  await page.getByRole("button", { name: "Continue →", exact: true }).click();
  await page.getByRole("heading", { name: "Is this your store?" }).waitFor();
  await page.getByRole("button", { name: "Yes, continue to catalog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/catalog-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.goto(`${base}/admin`);
  await page.getByText("Sign in with your approved Google account.").waitFor();
  await page.screenshot({
    path: "test-results/admin-login.png",
    fullPage: true,
  });
  // Exercise signed session handling and allowlist checks without automating a real Google login.
  if (!process.env.AUTH_SECRET)
    throw new Error("AUTH_SECRET required for admin browser checks");
  const cookieName = "authjs.session-token";
  const approved = (process.env.ADMIN_EMAILS || "").split(",")[0].trim();
  const cookie = async (email: string) => ({
    name: cookieName,
    value: await encode({
      token: { email, name: "Browser test", sub: `browser-${suffix}` },
      secret: process.env.AUTH_SECRET!,
      salt: cookieName,
      maxAge: 600,
    }),
    domain: new URL(base).hostname,
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
  });
  await page
    .context()
    .addCookies([await cookie("not-approved@example.invalid")]);
  assert.equal((await page.request.get(`${base}/api/admin`)).status(), 401);
  await page.context().addCookies([await cookie(approved)]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/admin`);
  await page.getByRole("heading", { name: "Wholesale workspace" }).waitFor();
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Cotton bedding set" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Cost per unit", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "test-results/admin-products.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: o.reference })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Quantity for Cotton bedding set" })
    .fill("3");
  await page.getByLabel("Invoice sent", { exact: true }).check();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const [edited] = await db()`select * from terranova.orders where id=${o.id}`;
  assert.equal(Number(edited.total_dealer), 489.51);
  assert.equal(edited.invoice_sent, true);
  await page.screenshot({
    path: "test-results/admin-orders.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stores", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: code })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Updated");
  await page.getByRole("button", { name: "Save store", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Companies & agents", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: code })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Active agent", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save agent", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await page.request.get(`${base}/api/catalog?vendor=${code}`)).status(),
    404,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByText("Sign in with your approved Google account.").waitFor();
  assert.equal((await page.request.get(`${base}/api/admin`)).status(), 401);
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: customer ordering/CSV/mobile, admin allowlist, product edit, historical order edit, store edit, agent disable and sign out. Google OAuth redirect itself still requires manual verification.",
  );
} finally {
  await browser?.close();
  await db().begin(async (tx) => {
    const ids =
      await tx`select id from terranova.orders where agent_code=${code}`;
    for (const { id } of ids) {
      await tx`delete from terranova.email_outbox where order_id=${id}`;
      await tx`delete from terranova.order_lines where order_id=${id}`;
      await tx`delete from terranova.audit_events where entity_id=${id}`;
      await tx`delete from terranova.orders where id=${id}`;
    }
    const stores =
      await tx`select id from terranova.stores where agent_id in(select id from terranova.agents where code=${code})`;
    for (const { id } of stores)
      await tx`delete from terranova.audit_events where entity_id=${id}`;
    if (productId) {
      await tx`delete from terranova.audit_events where entity_id=${productId}`;
      await tx`delete from terranova.product_agents where product_id=${productId}`;
      await tx`delete from terranova.products where id=${productId}`;
    }
    await tx`delete from terranova.stores where agent_id in(select id from terranova.agents where code=${code})`;
    await tx`delete from terranova.audit_events where entity_id in(select id::text from terranova.agents where code=${code})`;
    await tx`delete from terranova.agents where code=${code}`;
    await tx`delete from terranova.companies where name=${company}`;
    await tx`delete from terranova.audit_events where actor=${actor}`;
  });
  await db().end();
}
