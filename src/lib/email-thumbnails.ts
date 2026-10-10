import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { db } from "./db";
import type { Order } from "./domain";

export type EmailThumbnail = {
  lineId: string;
  cid: string;
  filename: string;
  content: string;
  encoding: "base64";
  contentType: "image/jpeg";
  width: number;
  height: number;
};

export async function resizeEmailThumbnail(input: Buffer) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: 112,
      height: 144,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return {
    content: data.toString("base64"),
    width: Math.max(1, Math.round(info.width / 2)),
    height: Math.max(1, Math.round(info.height / 2)),
  };
}

export async function orderEmailThumbnails(
  order: Order,
): Promise<EmailThumbnail[]> {
  const ids = order.lines.flatMap((line) =>
    line.productId && !line.image ? [line.productId] : [],
  );
  const sql = db();
  const products = ids.length
    ? await sql`select id,image from terranova.products where id in ${sql(ids)}`
    : [];
  const cache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof resizeEmailThumbnail>> | null>
  >();
  const thumbnails: EmailThumbnail[] = [];
  for (const line of order.lines) {
    const image =
      line.image ||
      products.find((product) => product.id === line.productId)?.image;
    if (!image) continue;
    if (!cache.has(image))
      cache.set(
        image,
        (async () => {
          try {
            let data: Buffer;
            const uploaded = /^\/api\/images\/([a-f0-9-]{36})$/.exec(image);
            if (uploaded) {
              const [stored] =
                await sql`select data from terranova.images where id=${uploaded[1]}`;
              if (!stored) return null;
              data = Buffer.from(stored.data);
            } else if (/^\/images\/[a-zA-Z0-9_.-]+$/.test(image)) {
              data = await readFile(resolve("public", image.slice(1)));
            } else return null;
            return await resizeEmailThumbnail(data);
          } catch {
            // A missing or corrupt product image must not prevent the order email.
            console.warn("Order email thumbnail unavailable", line.productId);
            return null;
          }
        })(),
      );
    const thumbnail = await cache.get(image)!;
    if (thumbnail)
      thumbnails.push({
        ...thumbnail,
        lineId: line.id,
        cid: `product-${line.id}`,
        filename: `product-${line.id}.jpg`,
        encoding: "base64",
        contentType: "image/jpeg",
      });
  }
  return thumbnails;
}
