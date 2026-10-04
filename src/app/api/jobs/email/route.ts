import { timingSafeEqual } from "node:crypto";
import { deliverEmails } from "@/lib/email";
import { json } from "@/lib/http";
export const maxDuration = 60;
export async function GET(req: Request) {
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return json({ error: "Unauthorized" }, 401);
  return json(await deliverEmails());
}
