import { z } from "zod";
export const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, hyphens or underscores")
  .transform((x) => x.toUpperCase());
const text = (max = 200) => z.string().trim().max(max);
export const companySchema = z.object({ name: text().min(1) });
export type Company = { id: string; name: string };
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(999999)
  .refine(
    (n) => Math.abs(n * 10000 - Math.round(n * 10000)) < 0.0001,
    "Use at most four decimal places",
  );
export const storeSchema = z.object({
  id: z.uuid().optional(),
  vendorCode: codeSchema,
  storeCode: codeSchema,
  firstName: text().min(1),
  lastName: text().min(1),
  email: z.email().max(254),
});
export const productSchema = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    name: text().min(1),
    sku: text(),
    barcode: text(),
    cost: money.nullable(),
    dealerPrice: money.nullable().optional(),
    minimumOrder: z.number().int().min(1).max(100000).optional(),
    companyId: z.uuid().nullable().optional(),
    srp: money,
    orderUnit: text(40).min(1),
    unitsPerOrder: z.coerce.number().int().min(1).max(100000),
    unitLabel: text(40).min(1),
    category: text(100).min(1),
    style: text(),
    description: text(4000),
    image: text(300).refine(
      (x) =>
        !x ||
        /^\/images\/[a-zA-Z0-9_.-]+$/.test(x) ||
        /^\/api\/images\/[a-f0-9-]{36}$/.test(x),
      "Choose a catalog image",
    ),
    status: z.enum(["available", "unavailable", "hidden"]),
    agentCodes: z.array(codeSchema).max(500),
  })
  .refine(
    (p) => p.cost != null || p.dealerPrice != null,
    "Supply cost or a published dealer price",
  );
export const agentSchema = z.object({
  id: z.uuid().optional(),
  company: text().min(1),
  code: codeSchema.refine((x) => x.length >= 3),
  firstName: text(),
  lastName: text(),
  email: z.union([z.email().max(254), z.literal("")]),
  active: z.boolean(),
});
export const orderSchema = z
  .object({
    vendorCode: codeSchema,
    storeCode: codeSchema,
    comments: text(4000),
    customerPo: text().optional(),
    contactPhone: text(80).optional(),
    idempotencyKey: z.uuid(),
    lines: z
      .array(
        z.object({
          productId: z.uuid(),
          qty: z.number().int().min(1).max(100000),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine(
    (x) => new Set(x.lines.map((l) => l.productId)).size === x.lines.length,
    "Duplicate products in order",
  );
export const editOrderSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    comments: text(4000),
    customerPo: text().optional(),
    contactPhone: text(80).optional(),
    orderSent: z.boolean(),
    invoiceSent: z.boolean(),
    paymentReceived: z.boolean(),
    cancelled: z.boolean(),
    lines: z
      .array(
        z.object({ id: z.uuid(), qty: z.number().int().min(1).max(100000) }),
      )
      .min(1)
      .max(200),
  })
  .refine(
    (x) => new Set(x.lines.map((l) => l.id)).size === x.lines.length,
    "Duplicate order lines",
  );
export type ProductInput = z.infer<typeof productSchema>;
export type Product = ProductInput & {
  id: string;
  version: number;
  catalogKey?: string;
};
export type Agent = z.infer<typeof agentSchema> & { id: string };
export type Store = z.infer<typeof storeSchema> & {
  id: string;
  company: string;
};
export type OrderLine = {
  id: string;
  productId: string | null;
  name: string;
  sku: string;
  barcode: string;
  orderUnit: string;
  unitLabel: string;
  unitsPerOrder: number;
  cost: number | null;
  dealerUnit: number;
  srpUnit: number;
  qty: number;
  minimumOrder?: number;
  lineDealer: number;
  lineRetail: number;
};
export type Order = {
  id: string;
  reference: string;
  version: number;
  date: string;
  company: string;
  agentCode: string;
  agentName: string;
  storeCode: string;
  contactName: string;
  customerEmail: string;
  comments: string;
  customerPo?: string;
  contactPhone?: string;
  orderSent: boolean;
  invoiceSent: boolean;
  paymentReceived: boolean;
  cancelled: boolean;
  totalDealer: number;
  totalRetail: number;
  lines: OrderLine[];
};

// Exact decimal arithmetic: preserve cost × 1.11 until rounding each line to cents.
export function dealerPrice(p: {
  cost: number | null;
  dealerPrice?: number | null;
}) {
  if (p.dealerPrice != null) return p.dealerPrice;
  if (p.cost == null) throw new Error("Missing product price");
  return p.cost * 1.11;
}
export function productAmounts(
  p: { cost: number | null; dealerPrice?: number | null; srp: number },
  units: number,
) {
  return {
    dealerUnit: dealerPrice(p),
    ...snapshotAmounts(dealerPrice(p), p.srp, units),
  };
}
function scaled(value: number | string, digits: number): bigint {
  const fixed = Number(value).toFixed(digits);
  return BigInt(fixed.replace(".", ""));
}
function cents(value: bigint, divisor: bigint) {
  return Number((value + divisor / 2n) / divisor) / 100;
}
export function lineAmounts(
  cost: number | string,
  srp: number | string,
  units: number,
) {
  return {
    dealerUnit: Number(cost) * 1.11,
    lineDealer: cents(scaled(cost, 4) * 111n * BigInt(units), 10000n),
    lineRetail: cents(scaled(srp, 4) * BigInt(units), 100n),
  };
}
export function snapshotAmounts(
  dealer: number | string,
  srp: number | string,
  units: number,
) {
  return {
    lineDealer: cents(scaled(dealer, 6) * BigInt(units), 10000n),
    lineRetail: cents(scaled(srp, 4) * BigInt(units), 100n),
  };
}
export function sumMoney(values: number[]) {
  return values.reduce((s, n) => s + Math.round(n * 100), 0) / 100;
}
export const moneyFormat = (n: number) => "$" + n.toFixed(2);
export function csvCell(value: unknown) {
  const s = String(value ?? "");
  return (
    '"' + (/^[\s]*[=+\-@]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"'
  );
}

export const categorySchema = z.object({
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  nameEn: text(100).min(1),
  nameFr: text(100).min(1),
});
export type Category = z.infer<typeof categorySchema> & {
  id: string;
  version: number;
  productCount: number;
};
