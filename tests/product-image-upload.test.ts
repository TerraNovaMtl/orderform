import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareProductImage } from "../src/lib/product-image-upload";

test("small product images retain their original file and invalid sources show clear errors", async () => {
  const file = new File(["image"], "page.png", { type: "image/png" });
  assert.equal(await prepareProductImage(file), file);
  await assert.rejects(
    prepareProductImage(
      new File(["pdf"], "page.pdf", { type: "application/pdf" }),
    ),
    /PNG, JPEG/,
  );
  await assert.rejects(
    prepareProductImage(new File([], "page.png", { type: "image/png" })),
    /empty/,
  );
  await assert.rejects(
    prepareProductImage(
      new File([new Uint8Array(21 * 1024 * 1024)], "page.png", {
        type: "image/png",
      }),
    ),
    /under 20 MB/,
  );
});

test("large product pages optimize without cropping and preserve original dimensions when possible", async () => {
  const oldBitmap = globalThis.createImageBitmap;
  const oldDocument = globalThis.document;
  let closed = false;
  const draws: number[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (_image: unknown, ...bounds: number[]) => draws.push(bounds),
    }),
    toBlob: (callback: (blob: Blob) => void) =>
      callback(new Blob([new Uint8Array(1000)], { type: "image/webp" })),
  };
  globalThis.createImageBitmap = (async () => ({
    width: 2550,
    height: 3300,
    close: () => {
      closed = true;
    },
  })) as typeof createImageBitmap;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  try {
    const result = await prepareProductImage(
      new File([new Uint8Array(3 * 1024 * 1024)], "page.png", {
        type: "image/png",
      }),
    );
    assert.ok(result.size <= 2097152);
    assert.equal(result.type, "image/webp");
    assert.equal(canvas.width, 2550);
    assert.equal(canvas.height, 3300);
    assert.deepEqual(draws, [[0, 0, 2550, 3300]]);
    assert.equal(closed, true);
  } finally {
    globalThis.createImageBitmap = oldBitmap;
    globalThis.document = oldDocument;
  }
});
