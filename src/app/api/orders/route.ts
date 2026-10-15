import { submitOrder } from "@/lib/repository";
import { errorResponse, json, rateLimit, readJson } from "@/lib/http";
import { after } from "next/server";
import { deliverEmails } from "@/lib/email";
import { toDealerOrder } from "@/lib/dealer-responses";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    await rateLimit(req, "orders", 30);
    const order = await submitOrder(body);
    after(async () => {
      try {
        await deliverEmails();
      } catch {
        console.error("Email worker deferred to scheduled retry");
      }
    });
    return json({ order: toDealerOrder(order) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
