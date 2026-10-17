import { getCatalogCover } from "@/lib/catalog-cover";
import { codeSchema } from "@/lib/domain";
import { getAgent, listProducts, listCategories } from "@/lib/repository";
import { errorResponse, json, rateLimit } from "@/lib/http";
import { toDealerProduct } from "@/lib/dealer-responses";
export async function GET(req: Request) {
  try {
    const code = codeSchema.parse(new URL(req.url).searchParams.get("vendor"));
    await rateLimit(req, "catalog", 120);
    const agent = await getAgent(code);
    const [products, categories, coverImage] = await Promise.all([
      listProducts(code),
      listCategories(),
      getCatalogCover(),
    ]);
    return json({
      agent,
      products: products.map(toDealerProduct),
      categories,
      coverImage,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
