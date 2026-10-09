// Browser-side image helpers for the tools that never leave the user's device

export type OutputFormat = "image/jpeg" | "image/png" | "image/webp";

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Decodes a file, applying its EXIF rotation */
export async function loadImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that image. Try a JPG, PNG or WebP.");
  }
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: OutputFormat, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not encode the image"));
        // Safari falls back to PNG when it can't encode WebP
        else if (blob.type !== type) reject(new Error(`This browser can't save ${FORMAT_EXTENSIONS[type].toUpperCase()} files`));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/** Sets the print resolution in a JPEG's JFIF header so it prints at the right size */
export async function setJpegDpi(jpeg: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  // SOI, APP0 marker, length, "JFIF\0"
  const isJfif =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[3] === 0xe0 &&
    String.fromCharCode(...bytes.slice(6, 10)) === "JFIF";
  if (!isJfif) return jpeg;
  bytes[13] = 1; // dots per inch
  bytes[14] = dpi >> 8;
  bytes[15] = dpi & 0xff;
  bytes[16] = dpi >> 8;
  bytes[17] = dpi & 0xff;
  return new Blob([bytes], { type: "image/jpeg" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Zips files in the browser and downloads the archive */
export async function downloadZip(files: { name: string; blob: Blob }[], zipName: string) {
  const { zipSync } = await import("fflate");
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const { name, blob } of files) {
    let unique = name;
    for (let n = 2; unique in entries; n++) unique = name.replace(/(\.\w+)?$/, `-${n}$1`);
    // Images are already compressed, so store them as is
    entries[unique] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  const zipped = zipSync(entries);
  downloadBlob(new Blob([zipped], { type: "application/zip" }), zipName);
}

export function baseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "") || "image";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

let filterSupport: boolean | undefined;

/** Whether ctx.filter really blurs (older Safari accepts the property but ignores it) */
function canvasFilterWorks() {
  if (filterSupport === undefined) {
    const { ctx } = createCanvas(12, 12);
    ctx.filter = "blur(2px)";
    ctx.fillRect(5, 5, 2, 2);
    filterSupport = ctx.getImageData(2, 6, 1, 1).data[3] > 0;
  }
  return filterSupport;
}

/** Draws the source blurred to fill a width × height canvas */
export function drawBlurred(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  radius: number,
) {
  if (radius <= 0) {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  if (canvasFilterWorks()) {
    // Pad the edges with a stretched copy so the blur doesn't fade to transparent at the border
    const pad = Math.ceil(radius * 2);
    const padded = createCanvas(width + pad * 2, height + pad * 2);
    padded.ctx.drawImage(source, 0, 0, padded.canvas.width, padded.canvas.height);
    padded.ctx.drawImage(source, pad, pad, width, height);
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(padded.canvas, -pad, -pad);
    ctx.restore();
    return;
  }
  // Fallback: shrink and scale back up a few times, which smooths like a blur
  let current: CanvasImageSource = source;
  let w = width;
  let h = height;
  const factor = Math.max(1, radius / 2);
  while (factor > 1 && w / 2 >= width / factor && h > 2) {
    w /= 2;
    h /= 2;
    const step = createCanvas(w, h);
    step.ctx.drawImage(current, 0, 0, step.canvas.width, step.canvas.height);
    current = step.canvas;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(current, 0, 0, width, height);
}
