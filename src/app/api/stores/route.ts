import { codeSchema } from "@/lib/domain";
import { lookupStore, saveStore, AppError } from "@/lib/repository";
import { errorResponse, json, rateLimit, readJson } from "@/lib/http";
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    await rateLimit(req, "stores", 40);
    if (body.action === "lookup")
      return json({
        store: await lookupStore(
          codeSchema.parse(body.vendorCode),
          codeSchema.parse(body.storeCode),
        ),
      });
    if (body.action === "save")
      return json({ store: await saveStore(body.store) });
    throw new AppError("Unknown action");
  } catch (e) {
    return errorResponse(e);
  }
}
