import { codeSchema } from "@/lib/domain";
import { getAgent, listProducts } from "@/lib/repository";
import { errorResponse, json, rateLimit } from "@/lib/http";
export async function GET(req: Request) {
  try {
    const code = codeSchema.parse(new URL(req.url).searchParams.get("vendor"));
    await rateLimit(req, "catalog", 120);
    const agent = await getAgent(code);
    return json({ agent, products: await listProducts(code) });
  } catch (e) {
    return errorResponse(e);
  }
}
