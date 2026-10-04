import { db } from "./db";
import { AppError, audit } from "./repository";
export async function uploadImage(base64: unknown, actor: string) {
  if (
    typeof base64 !== "string" ||
    base64.length > 2_800_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new AppError("Select a PNG, JPEG, WebP or GIF under 2 MB");
  const data = Buffer.from(base64, "base64");
  const type = data
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? "image/jpeg"
      : /GIF8[79]a/.test(data.subarray(0, 6).toString())
        ? "image/gif"
        : data.subarray(0, 4).toString() === "RIFF" &&
            data.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : null;
  if (!type || data.length > 2_097_152)
    throw new AppError("Select a PNG, JPEG, WebP or GIF under 2 MB");
  return db().begin(async (tx) => {
    const [r] =
      await tx`insert into terranova.images (content_type,data) values (${type},${data}) returning id`;
    await audit(tx, actor, "image.uploaded", r.id);
    return { image: `/api/images/${r.id}` };
  });
}
