import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { db } from "./db";
import { AppError } from "./repository";
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  const code = (error as { code?: string })?.code;
  if (code === "23505")
    return json(
      {
        error:
          "That code already exists. Choose another code or edit the existing record.",
      },
      409,
    );
  console.error("Request failed", { code: code || "internal" });
  return json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
}
export async function readJson(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("Expected JSON", 415);
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError("Invalid request origin", 403);
    }
    if (originHost !== (req.headers.get("host") || new URL(req.url).host))
      throw new AppError("Invalid request origin", 403);
  }
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Invalid request origin", 403);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("Request body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3_000_000) {
      await reader.cancel();
      throw new AppError("Request too large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new AppError("Invalid JSON");
  }
}
export async function rateLimit(req: Request, action: string, limit: number) {
  const ip = process.env.VERCEL
    ? req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-forwarded-for") ||
      "unknown"
    : "local";
  const key = createHash("sha256").update(`${ip}:${action}`).digest("hex");
  const [row] =
    await db()`insert into terranova.rate_limits (key,count,expires_at) values (${key},1,now()+interval '10 minutes') on conflict(key) do update set count=case when terranova.rate_limits.expires_at<now() then 1 else terranova.rate_limits.count+1 end, expires_at=case when terranova.rate_limits.expires_at<now() then now()+interval '10 minutes' else terranova.rate_limits.expires_at end returning count`;
  if (row.count > limit)
    throw new AppError(
      "Too many requests. Please try again in a few minutes.",
      429,
    );
}
