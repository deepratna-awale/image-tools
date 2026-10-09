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

export async function stripMetadata(file: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return new Blob([stripJpeg(bytes)], { type: "image/jpeg" });
  if (ascii(1, 4) === "PNG") return new Blob([stripPng(bytes)], { type: "image/png" });
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return new Blob([stripWebp(bytes)], { type: "image/webp" });
  throw new Error("Only JPG, PNG and WebP files are supported");
}
