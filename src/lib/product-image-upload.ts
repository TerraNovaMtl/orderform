const UPLOAD_LIMIT = 2_097_152;
const SOURCE_LIMIT = 20_971_520;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Keep the whole image; only optimize files that exceed the upload size limit. */
export async function prepareProductImage(file: File): Promise<Blob> {
  if (!TYPES.includes(file.type))
    throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  if (file.size > SOURCE_LIMIT) throw new Error("Choose an image under 20 MB.");
  if (!file.size) throw new Error("The selected image is empty.");
  if (file.size <= UPLOAD_LIMIT) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This image could not be opened. Export it as PNG or JPEG and try again.",
    );
  }
  try {
    const canvas = document.createElement("canvas");
    let width = bitmap.width,
      height = bitmap.height;
    for (let scale = 0; scale < 6; scale++) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Unable to prepare the image in this browser.");
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.95, 0.9, 0.85, 0.8]) {
        const result = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality),
        );
        if (result && result.size <= UPLOAD_LIMIT) return result;
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error(
      "This image is still too large to upload. Export a smaller PNG or JPEG and try again.",
    );
  } finally {
    bitmap.close();
  }
}
