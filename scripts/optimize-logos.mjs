import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public/images");
await mkdir(output, { recursive: true });

// Three times the maximum display width, preserving transparency and aspect ratio.
for (const [name, width] of [
  ["terra-nova-logo", 840],
  ["canadian-tire-clean", 252],
]) {
  const logo = sharp(path.join(root, "source-art/logos", `${name}.png`)).resize(
    { width, withoutEnlargement: true },
  );
  await logo
    .clone()
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(path.join(output, `${name}.webp`));
  // Existing email CID attachments use PNG for broad mail-client compatibility.
  await logo
    .clone()
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, `${name}.png`));
  console.log("done", name);
}
