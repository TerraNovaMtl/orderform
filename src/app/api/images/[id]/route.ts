import { z } from "zod";
import { db } from "@/lib/db";
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  const [r] =
    await db()`select content_type,data from terranova.images where id=${id}`;
  if (!r) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(r.data), {
    headers: {
      "Content-Type": r.content_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
