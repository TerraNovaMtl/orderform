import { z } from "zod";
import { adminEmail } from "@/lib/auth";
import {
  listCategories,
  saveCategory,
  deleteCategory,
  listProducts,
  listCompanies,
  saveCompany,
  listAgents,
  listStores,
  listOrders,
  saveProduct,
  saveAgent,
  saveStore,
  deleteProduct,
  deleteStore,
  deleteOrder,
  deleteAgent,
  deleteCompany,
  editOrder,
  AppError,
} from "@/lib/repository";
import { json, errorResponse, readJson } from "@/lib/http";
import { uploadImage } from "@/lib/images";
import { db } from "@/lib/db";
export async function GET() {
  try {
    if (!(await adminEmail()))
      throw new AppError("Admin sign-in required", 401);
    const [
      products,
      companies,
      agents,
      stores,
      orders,
      notifications,
      categories,
    ] = await Promise.all([
      listProducts(),
      listCompanies(),
      listAgents(),
      listStores(),
      listOrders(),
      db()`select state,count(*)::int as count from terranova.email_outbox group by state`,
      listCategories(),
    ]);
    return json({
      products,
      companies,
      agents,
      stores,
      orders,
      notifications,
      categories,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await adminEmail();
    if (!actor) throw new AppError("Admin sign-in required", 401);
    const body = await readJson(req);
    let result;
    switch (body.action) {
      case "deleteCategory":
        result = await deleteCategory(
          z.uuid().parse(body.id),
          z.number().int().positive().parse(body.version),
          actor,
        );
        break;
      case "saveCategory":
        result = await saveCategory(body.data, actor);
        break;
      case "deleteCompany":
        result = await deleteCompany(z.uuid().parse(body.id), actor);
        break;
      case "deleteAgent":
        result = await deleteAgent(z.uuid().parse(body.id), actor);
        break;
      case "saveCompany":
        result = await saveCompany(body.data, actor);
        break;
      case "saveProduct":
        result = await saveProduct(body.data, actor);
        break;
      case "saveAgent":
        result = await saveAgent(body.data, actor);
        break;
      case "saveStore":
        result = await saveStore(body.data, actor);
        break;
      case "deleteProduct":
        result = await deleteProduct(z.uuid().parse(body.id), actor);
        break;
      case "deleteStore":
        result = await deleteStore(z.uuid().parse(body.id), actor);
        break;
      case "editOrder":
        result = await editOrder(body.data, actor);
        break;
      case "deleteOrder":
        result = await deleteOrder(
          z.uuid().parse(body.id),
          z.number().int().positive().parse(body.version),
          actor,
        );
        break;
      case "uploadImage":
        result = await uploadImage(body.contentBase64, actor);
        break;
      default:
        throw new AppError("Unknown action");
    }
    return json(result || { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
