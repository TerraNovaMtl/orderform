import sharp from "sharp";
import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = path.join(ROOT, "source-art/fma-pages");
const OUT = path.join(ROOT, "public/images/fma-pages");
const MANIFEST = path.join(ROOT, "src/lib/fma-pages.json");
const SIZES = [800, 1600];
const pages = JSON.parse(await readFile(MANIFEST, "utf8"));
const files = (await readdir(SRC))
  .filter((file) => /\.(png|jpe?g)$/i.test(file))
  .sort();
const names = new Set();

await mkdir(OUT, { recursive: true });
for (const file of files) {
  const name = path.parse(file).name;
  if (names.has(name)) throw new Error(`Duplicate master page: ${name}`);
  names.add(name);
  const input = path.join(SRC, file);
  for (const width of SIZES) {
    const info = await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(OUT, `${name}-${width}.webp`));
    if (width === 1600) {
      const page = pages.find(
        (page) => `page-${String(page.number).padStart(2, "0")}` === name,
      );
      if (page)
        Object.assign(page, {
          image: `/images/fma-pages/${name}-1600.webp`,
          width: info.width,
          height: info.height,
        });
    }
  }
  console.log("done", name);
}
for (const page of pages) {
  const name = `page-${String(page.number).padStart(2, "0")}`;
  if (!names.has(name)) throw new Error(`Missing master page: ${name}`);
}
await writeFile(MANIFEST, `${JSON.stringify(pages, null, 2)}\n`);
