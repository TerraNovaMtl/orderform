import { z } from "zod";
import { adminEmail } from "@/lib/auth";
import {
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
    const [products, companies, agents, stores, orders, notifications] =
      await Promise.all([
        listProducts(),
        listCompanies(),
        listAgents(),
        listStores(),
        listOrders(),
        db()`select state,count(*)::int as count from terranova.email_outbox group by state`,
      ]);
    return json({ products, companies, agents, stores, orders, notifications });
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
