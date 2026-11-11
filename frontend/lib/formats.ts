// Opening and saving every image format the browser tools support. Formats the browser can't handle
// on its own (HEIC, TIFF, AVIF and WebP saving, GIF, BMP, ICO) use small libraries loaded on demand.

export type ExportFormat = "jpg" | "png" | "webp" | "avif" | "jxl" | "gif" | "bmp" | "ico" | "tiff" | "pdf";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; mime: string; lossy: boolean }[] = [
  { id: "jpg", label: "JPG", mime: "image/jpeg", lossy: true },
  { id: "png", label: "PNG", mime: "image/png", lossy: false },
  { id: "webp", label: "WebP", mime: "image/webp", lossy: true },
  { id: "avif", label: "AVIF", mime: "image/avif", lossy: true },
  { id: "jxl", label: "JPEG XL", mime: "image/jxl", lossy: true },
  { id: "gif", label: "GIF", mime: "image/gif", lossy: false },
  { id: "bmp", label: "BMP", mime: "image/bmp", lossy: false },
  { id: "ico", label: "ICO", mime: "image/x-icon", lossy: false },
  { id: "tiff", label: "TIFF", mime: "image/tiff", lossy: false },
  { id: "pdf", label: "PDF", mime: "application/pdf", lossy: false },
];

export const formatInfo = (id: ExportFormat) => EXPORT_FORMATS.find((format) => format.id === id)!;

/** Camera RAW files, opened through the full-size JPEG preview the camera stores inside them */
const RAW_TYPES: [string, string[]][] = [
  ["image/x-adobe-dng", [".dng"]],
  ["image/x-canon-cr2", [".cr2"]],
  ["image/x-canon-cr3", [".cr3"]],
  ["image/x-canon-crw", [".crw"]],
  ["image/x-nikon-nef", [".nef", ".nrw"]],
  ["image/x-sony-arw", [".arw", ".srf", ".sr2"]],
  ["image/x-fuji-raf", [".raf"]],
  ["image/x-olympus-orf", [".orf"]],
  ["image/x-panasonic-rw2", [".rw2", ".rwl"]],
  ["image/x-pentax-pef", [".pef"]],
  ["image/x-samsung-srw", [".srw"]],
  ["image/x-sigma-x3f", [".x3f"]],
  ["image/x-hasselblad-3fr", [".3fr"]],
];
const RAW_EXTENSIONS = new Set(RAW_TYPES.flatMap(([, extensions]) => extensions));

/** Every format the browser tools open, for the file picker */
export const IMAGE_ACCEPT: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg", ".jfif", ".pjpeg", ".pjp"],
  "image/png": [".png", ".apng"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "image/bmp": [".bmp", ".dib"],
  "image/x-icon": [".ico", ".cur"],
  "image/vnd.microsoft.icon": [".ico"],
  "image/svg+xml": [".svg"],
  "image/tiff": [".tif", ".tiff"],
  "image/heic": [".heic"],
  "image/heif": [".heif", ".hif"],
  "image/heic-sequence": [".heics"],
  "image/heif-sequence": [".heifs"],
  "image/jxl": [".jxl"],
  "image/vnd.adobe.photoshop": [".psd"],
  ...Object.fromEntries(RAW_TYPES),
};

/** Formats the server tools take directly; anything else is converted in the browser before upload */
export const SERVER_FORMATS = new Set(["image/jpeg", "image/png", "image/webp"]);

type Kind = "heic" | "tiff" | "svg" | "psd" | "jxl" | "raw" | "other";

async function sniff(file: Blob & { name?: string }): Promise<Kind> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...head.subarray(start, end));
  const name = (file.name ?? "").toLowerCase();
  // Most RAW formats are TIFF inside, so check the extension before the TIFF signature
  const extension = name.slice(name.lastIndexOf("."));
  if (RAW_EXTENSIONS.has(extension)) return "raw";
  if (ascii(0, 4) === "8BPS") return "psd";
  if ((head[0] === 0xff && head[1] === 0x0a) || ascii(4, 8) === "JXL ") return "jxl";
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 0x2a)) {
    return "tiff";
  }
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(ascii(8, 12))) {
    return "heic";
  }
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  return "other";
}

async function decodeTiff(file: Blob): Promise<ImageBitmap> {
  const UTIF = await import("utif2");
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  // The first full-size page (some TIFFs start with a thumbnail)
  const page = ifds.reduce((best, ifd) => ((ifd.width ?? 0) > (best.width ?? 0) ? ifd : best), ifds[0]);
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);
  const image = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), page.width, page.height);
  return createImageBitmap(image);
}

async function decodeSvg(file: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // SVGs without a size get a sensible default; small ones are drawn larger so they stay sharp
    const width = image.naturalWidth || 1024;
    const height = image.naturalHeight || 1024;
    const scale = Math.max(1, 1024 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodePsd(file: Blob): Promise<ImageBitmap> {
  const { readPsd } = await import("ag-psd");
  // The flattened image Photoshop saves alongside the layers ("maximize compatibility")
  const psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
  if (!psd.imageData) throw new Error("This PSD has no flattened image; re-save it with Maximize Compatibility on");
  const { width, height, data } = psd.imageData;
  return createImageBitmap(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width, height));
}

async function decodeJxl(file: Blob): Promise<ImageBitmap> {
  // Safari 17+ reads JPEG XL natively; elsewhere use the WebAssembly decoder
  try {
    return await createImageBitmap(file);
  } catch {
    const decode = (await import("@jsquash/jxl/decode")).default;
    return createImageBitmap(await decode(await file.arrayBuffer()));
  }
}

/**
 * Camera RAW files carry a full-size JPEG preview developed by the camera. Find the JPEG streams in the file
 * and keep the biggest one that decodes, rotated by the RAW's EXIF orientation.
 */
async function decodeRawPreview(file: Blob): Promise<ImageBitmap> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts: number[] = [];
  for (let i = 0; i < bytes.length - 3; i++) {
    // SOI followed by an APPn, DQT or SOF marker
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff && ((bytes[i + 3] & 0xf0) === 0xe0 || bytes[i + 3] === 0xdb || bytes[i + 3] === 0xc4)) {
      starts.push(i);
    }
  }
  const candidates = starts
    .map((start, i) => ({ start, length: (starts[i + 1] ?? bytes.length) - start }))
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
  let best: ImageBitmap | null = null;
  for (const { start, length } of candidates) {
    try {
      const image = await createImageBitmap(new Blob([bytes.subarray(start, start + length)], { type: "image/jpeg" }));
      if (!best || image.width * image.height > best.width * best.height) {
        best?.close();
        best = image;
      } else image.close();
    } catch {
      // not a complete JPEG; try the next one
    }
  }
  if (!best) throw new Error("No preview image found in this RAW file");
  const exifr = (await import("exifr")).default;
  const tags = await exifr.parse(file, { pick: ["Orientation"], translateValues: false }).catch(() => null);
  const orientation = tags?.Orientation;
  const turns = typeof orientation === "number" ? ({ 3: 2, 6: 1, 8: 3 } as Record<number, number>)[orientation] ?? 0 : 0;
  if (!turns) return best;
  const swap = turns % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? best.height : best.width;
  canvas.height = swap ? best.width : best.height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(best, -best.width / 2, -best.height / 2);
  best.close();
  return createImageBitmap(canvas);
}

/** Decodes any supported image, applying its EXIF rotation */
export async function decodeImage(file: Blob & { name?: string }): Promise<ImageBitmap> {
  const kind = await sniff(file);
  try {
    if (kind === "heic") {
      const { heicTo } = await import("heic-to/next");
      return await heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
    }
    if (kind === "tiff") return await decodeTiff(file);
    if (kind === "svg") return await decodeSvg(file);
    if (kind === "psd") return await decodePsd(file);
    if (kind === "jxl") return await decodeJxl(file);
    if (kind === "raw") return await decodeRawPreview(file);
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    const detail = (kind === "psd" || kind === "raw") && e instanceof Error ? ` (${e.message})` : "";
    throw new Error(`Couldn't open ${file.name || "this image"}. It may be damaged or in a format this browser can't read${detail}.`);
  }
}

function pixels(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
}

function nativeBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob && blob.type === mime ? blob : null), mime, quality));
}

function encodeBmp(image: ImageData): Blob {
  // 32-bit BMP with a V4 header so transparency survives
  const { width, height, data } = image;
  const headerSize = 14 + 108;
  const size = headerSize + width * height * 4;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint16(0, 0x4d42, true); // "BM"
  view.setUint32(2, size, true);
  view.setUint32(10, headerSize, true);
  view.setUint32(14, 108, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down rows
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 3, true); // BI_BITFIELDS
  view.setUint32(34, width * height * 4, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);
  view.setUint32(54, 0x00ff0000, true); // red mask
  view.setUint32(58, 0x0000ff00, true); // green
  view.setUint32(62, 0x000000ff, true); // blue
  view.setUint32(66, 0xff000000, true); // alpha
  view.setUint32(70, 0x73524742, true); // sRGB
  const out = new Uint8Array(buffer, headerSize);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i + 2];
    out[i + 1] = data[i + 1];
    out[i + 2] = data[i];
    out[i + 3] = data[i + 3];
  }
  return new Blob([buffer], { type: "image/bmp" });
}

/** A Windows icon holding PNGs at the usual sizes up to the image's own size */
async function encodeIco(canvas: HTMLCanvasElement): Promise<Blob> {
  const largest = Math.min(256, Math.max(canvas.width, canvas.height));
  const sizes = [16, 24, 32, 48, 64, 128, 256].filter((size) => size <= largest);
  if (sizes.length === 0) sizes.push(largest);
  const images: Uint8Array[] = [];
  for (const size of sizes) {
    const square = document.createElement("canvas");
    square.width = square.height = size;
    const ctx = square.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    const scale = size / Math.max(canvas.width, canvas.height);
    const w = canvas.width * scale;
    const h = canvas.height * scale;
    ctx.drawImage(canvas, (size - w) / 2, (size - h) / 2, w, h);
    const png = await nativeBlob(square, "image/png");
    images.push(new Uint8Array(await png!.arrayBuffer()));
  }
  const header = new DataView(new ArrayBuffer(6 + 16 * images.length));
  header.setUint16(2, 1, true); // icon
  header.setUint16(4, images.length, true);
  let offset = header.byteLength;
  images.forEach((png, i) => {
    const entry = 6 + i * 16;
    header.setUint8(entry, sizes[i] % 256); // 0 means 256
    header.setUint8(entry + 1, sizes[i] % 256);
    header.setUint16(entry + 4, 1, true);
    header.setUint16(entry + 6, 32, true);
    header.setUint32(entry + 8, png.length, true);
    header.setUint32(entry + 12, offset, true);
    offset += png.length;
  });
  return new Blob([header.buffer, ...images], { type: "image/x-icon" });
}

async function encodeGif(image: ImageData): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const hasAlpha = image.data.some((value, i) => i % 4 === 3 && value < 128);
  const palette = quantize(image.data, 256, { format: hasAlpha ? "rgba4444" : "rgb565", oneBitAlpha: hasAlpha });
  const index = applyPalette(image.data, palette, hasAlpha ? "rgba4444" : "rgb565");
  const transparentIndex = hasAlpha ? palette.findIndex((color: number[]) => color[3] === 0) : -1;
  const gif = GIFEncoder();
  gif.writeFrame(index, image.width, image.height, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

async function encodePdf(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const png = await nativeBlob(canvas, "image/png");
  const embedded = await pdf.embedPng(new Uint8Array(await png!.arrayBuffer()));
  const width = (canvas.width * 72) / dpi;
  const height = (canvas.height * 72) / dpi;
  pdf.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

/**
 * Saves a canvas in any export format. quality is 0 to 1 and only matters for lossy formats; dpi sets the page size
 * of a PDF (96 by default, the size the image shows at on screen)
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, format: ExportFormat, quality = 0.9, dpi = 96): Promise<Blob> {
  switch (format) {
    case "jpg":
    case "png": {
      const blob = await nativeBlob(canvas, formatInfo(format).mime, quality);
      if (!blob) throw new Error("Could not encode the image");
      return blob;
    }
    case "webp": {
      // Safari can't save WebP from a canvas, so fall back to the WebAssembly encoder
      const native = await nativeBlob(canvas, "image/webp", quality);
      if (native) return native;
      const encode = (await import("@jsquash/webp/encode")).default;
      return new Blob([await encode(pixels(canvas), { quality: Math.round(quality * 100) })], { type: "image/webp" });
    }
    case "avif": {
      const encode = (await import("@jsquash/avif/encode")).default;
      return new Blob([await encode(pixels(canvas), { quality: Math.round(quality * 100) })], { type: "image/avif" });
    }
    case "jxl": {
      const encode = (await import("@jsquash/jxl/encode")).default;
      return new Blob([await encode(pixels(canvas), { quality: Math.round(quality * 100) })], { type: "image/jxl" });
    }
    case "gif":
      return encodeGif(pixels(canvas));
    case "bmp":
      return encodeBmp(pixels(canvas));
    case "ico":
      return encodeIco(canvas);
    case "tiff": {
      const UTIF = await import("utif2");
      const image = pixels(canvas);
      return new Blob([UTIF.encodeImage(new Uint8Array(image.data.buffer), image.width, image.height)], { type: "image/tiff" });
    }
    case "pdf":
      return encodePdf(canvas, dpi);
  }
}

/** The format to save an edited image in: the same as it came in where possible */
export function sameFormat(file: Blob & { name?: string }): ExportFormat {
  const match = EXPORT_FORMATS.find((format) => format.mime === file.type && format.id !== "pdf" && format.id !== "ico");
  if (match) return match.id;
  // HEIC photos become JPG; icons and vector images become PNG
  return file.type.startsWith("image/hei") || /\.(heic|heif|hif)$/i.test(file.name ?? "") ? "jpg" : "png";
}

const SERVER_MAX_BYTES = 10 * 1024 * 1024;

/** Converts formats the server tools can't read (HEIC, TIFF, AVIF...) and oversized files to JPG, or PNG when transparent */
export async function toServerFormat(file: File): Promise<File> {
  if (SERVER_FORMATS.has(file.type) && file.size <= SERVER_MAX_BYTES) return file;
  const image = await decodeImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  image.close();
  const transparent = pixels(canvas).data.some((value, i) => i % 4 === 3 && value < 255);
  const format: ExportFormat = transparent ? "png" : "jpg";
  let blob = await encodeCanvas(canvas, format, 0.95);
  if (blob.size > SERVER_MAX_BYTES) blob = await encodeCanvas(canvas, "jpg", 0.85);
  const extension = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, { type: blob.type });
}
