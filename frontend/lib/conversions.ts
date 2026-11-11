// The "X to Y" converter pages: which formats each side offers, and their names
import { ExportFormat } from "./formats";

export interface InputFormat {
  id: string;
  label: string;
  /** What the format is, for the page text */
  about: string;
}

export const INPUTS: InputFormat[] = [
  { id: "heic", label: "HEIC", about: "the photo format iPhones and iPads save by default" },
  { id: "jpg", label: "JPG", about: "the most widely supported photo format" },
  { id: "png", label: "PNG", about: "a lossless format that keeps transparency" },
  { id: "webp", label: "WebP", about: "Google's web image format, smaller than JPG and PNG" },
  { id: "avif", label: "AVIF", about: "a modern, very small web image format based on AV1" },
  { id: "jxl", label: "JPEG XL", about: "the next-generation JPEG successor" },
  { id: "gif", label: "GIF", about: "the classic 256-colour format for simple graphics and animations" },
  { id: "svg", label: "SVG", about: "a vector graphics format used for logos and icons" },
  { id: "tiff", label: "TIFF", about: "a high-quality format used in printing and scanning" },
  { id: "bmp", label: "BMP", about: "the uncompressed Windows bitmap format" },
  { id: "ico", label: "ICO", about: "the Windows icon and favicon format" },
  { id: "psd", label: "PSD", about: "Adobe Photoshop's document format (the flattened image is used)" },
  { id: "dng", label: "DNG", about: "Adobe's open camera RAW format (the camera's full-size preview is used)" },
  { id: "cr2", label: "CR2", about: "Canon's camera RAW format (the camera's full-size preview is used)" },
  { id: "cr3", label: "CR3", about: "Canon's newer camera RAW format (the camera's full-size preview is used)" },
  { id: "nef", label: "NEF", about: "Nikon's camera RAW format (the camera's full-size preview is used)" },
  { id: "arw", label: "ARW", about: "Sony's camera RAW format (the camera's full-size preview is used)" },
  { id: "raf", label: "RAF", about: "Fujifilm's camera RAW format (the camera's full-size preview is used)" },
  { id: "orf", label: "ORF", about: "Olympus/OM System's camera RAW format (the camera's full-size preview is used)" },
  { id: "rw2", label: "RW2", about: "Panasonic's camera RAW format (the camera's full-size preview is used)" },
];

export const OUTPUTS: { id: ExportFormat; label: string; why: string }[] = [
  { id: "jpg", label: "JPG", why: "opens everywhere and keeps photos small" },
  { id: "png", label: "PNG", why: "is lossless and keeps transparency" },
  { id: "webp", label: "WebP", why: "is much smaller than JPG and PNG and works in every modern browser" },
  { id: "avif", label: "AVIF", why: "gives the smallest files at the same quality" },
  { id: "jxl", label: "JPEG XL", why: "is small, high-quality and supports transparency and HDR" },
  { id: "pdf", label: "PDF", why: "is easy to print, email and attach to forms" },
  { id: "gif", label: "GIF", why: "works in very old software and email clients" },
  { id: "tiff", label: "TIFF", why: "is lossless and preferred for printing and archiving" },
  { id: "bmp", label: "BMP", why: "is uncompressed and opens in any Windows program" },
  { id: "ico", label: "ICO", why: "is what Windows icons and website favicons use" },
];

export interface Conversion {
  slug: string;
  from: InputFormat;
  to: (typeof OUTPUTS)[number];
}

const sameFormat = (from: string, to: string) => from === to;

export const CONVERSIONS: Conversion[] = INPUTS.flatMap((from) =>
  OUTPUTS.filter((to) => !sameFormat(from.id, to.id)).map((to) => ({ slug: `${from.id}-to-${to.id}`, from, to })),
);

export const conversionBySlug = (slug: string) => CONVERSIONS.find((conversion) => conversion.slug === slug);

/** The conversions people search for most, shown first on the hub page */
export const POPULAR = [
  "heic-to-jpg", "webp-to-jpg", "webp-to-png", "png-to-jpg", "jpg-to-png", "avif-to-jpg", "jpg-to-webp", "png-to-webp",
  "svg-to-png", "jpg-to-pdf", "png-to-pdf", "heic-to-png", "png-to-ico", "jpg-to-avif", "gif-to-png", "tiff-to-jpg",
  "psd-to-png", "dng-to-jpg", "cr2-to-jpg", "nef-to-jpg", "jxl-to-jpg", "bmp-to-jpg",
];
