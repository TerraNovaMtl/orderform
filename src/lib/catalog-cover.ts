import { db } from "./db";
import { AppError, audit } from "./repository";
import { DEFAULT_COVER_IMAGE } from "./catalog-pages";
import { z } from "zod";

export async function getCatalogCover() {
  const [row] =
    await db()`select image from terranova.catalog_settings where key = 'cover'`;
  return row?.image ?? DEFAULT_COVER_IMAGE;
}

export async function saveCatalogCover(value: unknown, actor: string) {
  const image = z
    .string()
    .regex(/^\/api\/images\/[0-9a-f-]{36}$/)
    .parse(value);
  await db().begin(async (tx) => {
    const id = image.split("/").at(-1)!;
    const [exists] =
      await tx`select id from terranova.images where id = ${id}::uuid`;
    if (!exists) throw new AppError("Upload a cover image first");
    await tx`insert into terranova.catalog_settings (key, image) values ('cover', ${image}) on conflict (key) do update set image = excluded.image`;
    await audit(tx, actor, "catalog.cover_saved", "catalog", { image });
  });
  return { image };
}
