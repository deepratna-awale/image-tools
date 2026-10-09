// Removes location, camera and other hidden details from photos without re-encoding them,
// so the picture itself is byte-for-byte unchanged

function readExifOrientation(segment: Uint8Array): number {
  // segment = "Exif\0\0" + TIFF data
  const tiff = segment.subarray(6);
  if (tiff.length < 8) return 1;
  const little = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, little);
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

/** An EXIF block holding only the rotation, so phone photos still display the right way up */
function orientationOnlyExif(orientation: number): Uint8Array {
  const body = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...body]);
}

const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const SOS = 0xda;

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("This JPG looks damaged");
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++; // fill byte
      continue;
    }
    if (marker === SOS) {
      if (orientation !== 1) parts.splice(1, 0, orientationOnlyExif(orientation));
      // Image data runs to the end-of-image marker; anything after it (extra preview images, motion photo video) goes
      let end = offset + 2;
      while (end + 1 < bytes.length && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) end++;
      parts.push(bytes.subarray(offset, end + 2));
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const segment = bytes.subarray(offset, offset + 2 + length);
    const payload = segment.subarray(4);
    const isExif = marker === APP1 && String.fromCharCode(...payload.subarray(0, 4)) === "Exif";
    if (isExif) orientation = readExifOrientation(payload);
    const isIcc = marker === APP2 && String.fromCharCode(...payload.subarray(0, 11)) === "ICC_PROFILE";
    // Keep image structure, JFIF, the colour profile and Adobe colour info; drop EXIF, XMP, IPTC, comments and the rest
    const keep = marker < APP0 || marker === APP0 || isIcc || marker === APP14;
    if (keep) parts.push(segment);
    offset += 2 + length;
  }
  return concat(parts);
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function stripPng(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripWebp(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (!WEBP_DROP.has(type)) {
      const chunk = bytes.slice(offset, end);
      // Clear the "has EXIF" and "has XMP" flags
      if (type === "VP8X") chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = concat(chunks);
  const header = bytes.slice(0, 12);
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The EXIF data inside a WebP file, as TIFF bytes, for reading what it holds */
export async function webpExif(file: Blob): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP") return null;
  const view = new DataView(bytes.buffer);
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (type === "EXIF") {
      const data = bytes.subarray(offset + 8, offset + 8 + size);
      return String.fromCharCode(...data.subarray(0, 4)) === "Exif" ? data.subarray(6) : data;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Drops comment and XMP blocks from a GIF, keeping every frame and the loop setting */
function stripGif(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let offset = 13;
  const flags = bytes[10];
  if (flags & 0x80) offset += 3 * (1 << ((flags & 0x07) + 1)); // global colour table
  parts.push(bytes.subarray(0, offset));
  const skipSubBlocks = (start: number) => {
    let at = start;
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1;
    return at + 1;
  };
  while (offset < bytes.length) {
    const block = bytes[offset];
    if (block === 0x3b) {
      parts.push(bytes.subarray(offset, offset + 1));
      break;
    }
    if (block === 0x21) {
      const label = bytes[offset + 1];
      const end = skipSubBlocks(offset + 2);
      const appId = label === 0xff ? String.fromCharCode(...bytes.subarray(offset + 3, offset + 14)) : "";
      const isMetadata = label === 0xfe || (label === 0xff && !appId.startsWith("NETSCAPE") && !appId.startsWith("ANIMEXTS"));
      if (!isMetadata) parts.push(bytes.subarray(offset, end));
      offset = end;
    } else if (block === 0x2c) {
      let end = offset + 10;
      const imageFlags = bytes[offset + 9];
      if (imageFlags & 0x80) end += 3 * (1 << ((imageFlags & 0x07) + 1)); // local colour table
      end = skipSubBlocks(end + 1); // LZW minimum code size, then the image data
      parts.push(bytes.subarray(offset, end));
      offset = end;
    } else {
      throw new Error("This GIF looks damaged");
    }
  }
  return concat(parts);
}

/** Removes the metadata block, comments and editor data from an SVG */
function stripSvg(text: string): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("This SVG looks damaged");
  doc.querySelectorAll("metadata").forEach((node) => node.remove());
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((node) => node.parentNode?.removeChild(node));
  doc.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (/^(sodipodi|inkscape):/.test(attribute.name)) element.removeAttribute(attribute.name);
    }
    if (/^(sodipodi|inkscape):/.test(element.tagName)) element.remove();
  });
  return new XMLSerializer().serializeToString(doc);
}

export interface Stripped {
  blob: Blob;
  name: string;
  /** True when the file had to be saved again (formats that can't be cleaned in place), which can change the pixels slightly */
  resaved: boolean;
}

/** Removes hidden details from an image. JPG, PNG, WebP, GIF and SVG are cleaned in place; others are re-saved */
export async function stripMetadata(file: File): Promise<Stripped> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const same = (data: BlobPart, type: string): Stripped => ({ blob: new Blob([data], { type }), name: file.name, resaved: false });
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return same(stripJpeg(bytes), "image/jpeg");
  if (ascii(1, 4) === "PNG") return same(stripPng(bytes), "image/png");
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return same(stripWebp(bytes), "image/webp");
  if (ascii(0, 4) === "GIF8") return same(stripGif(bytes), "image/gif");
  // BMP and ICO files have no room for location or camera details
  if (ascii(0, 2) === "BM" || (bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2) && bytes[3] === 0)) {
    return same(bytes, file.type || "application/octet-stream");
  }
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    return same(stripSvg(new TextDecoder().decode(bytes)), "image/svg+xml");
  }

  // TIFF, AVIF and HEIC: decoding and saving again leaves the metadata behind
  const { decodeImage, encodeCanvas, sameFormat } = await import("./formats");
  const image = await decodeImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  image.close();
  const format = sameFormat(file);
  const blob = await encodeCanvas(canvas, format, 0.92);
  return { blob, name: `${file.name.replace(/\.[^.]+$/, "")}.${format}`, resaved: true };
}
