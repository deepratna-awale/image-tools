import {
  BrushCleaning,
  Eraser,
  Expand,
  FileSearch,
  FileText,
  Focus,
  IdCard,
  ImageIcon,
  ImageUpscale,
  type LucideIcon,
  Scaling,
  ShieldCheck,
  ShieldHalf,
  Stamp,
  Sunset,
} from "lucide-react";

export type ToolCategory = "ai" | "edit" | "privacy";

export interface Tool {
  href: string;
  name: string;
  description: string;
  /** Square illustration in public/tiles */
  image: string;
  icon: LucideIcon;
  category: ToolCategory;
  comingSoon?: boolean;
}

/** Home page sections and menu groups, in display order. Empty ones are hidden. */
export const CATEGORIES: { id: ToolCategory; name: string; description: string }[] = [
  { id: "edit", name: "Edit & Convert", description: "Resize, convert and prepare images for wherever they're going." },
  { id: "ai", name: "Backgrounds & AI", description: "Cut out, replace or restyle what's behind your subject." },
  {
    id: "privacy",
    name: "Privacy & Metadata",
    description: "See or remove what's hidden inside an image file, and keep your work out of AI training.",
  },
];

/** Every tool on the site, in the order the home page and menus show them */
export const TOOLS: Tool[] = [
  {
    href: "/bg-remover",
    name: "Background Remover",
    description: "Cut out the subject and get a transparent PNG. Up to 10 images at once.",
    image: "/tiles/bg-remover.webp",
    icon: Eraser,
    category: "ai",
  },
  {
    href: "/bg-changer",
    name: "Background Changer",
    description: "Put your subject on a new background, a solid colour or your own picture.",
    image: "/tiles/bg-changer.webp",
    icon: ImageIcon,
    category: "ai",
  },
  {
    href: "/blur-background",
    name: "Blur Background",
    description: "Blur what's behind your subject for a portrait-mode look.",
    image: "/tiles/blur-background.webp",
    icon: Focus,
    category: "ai",
  },
  {
    href: "/sky-swap",
    name: "Sky Swap",
    description: "Replace a dull sky with a sunset, golden hour or a sky of your own.",
    image: "/tiles/sky-swap.webp",
    icon: Sunset,
    category: "ai",
  },
  {
    href: "/upscaler",
    name: "Image Upscaler",
    description: "Enlarge photos, anime and art up to 4× or to an exact size, with sharp detail.",
    image: "/tiles/upscaler.webp",
    icon: ImageUpscale,
    category: "ai",
  },
  {
    href: "/watermark-remover",
    name: "Watermark Remover",
    description: "AI finds watermarks, logos and text, then repaints the photo as if they were never there.",
    image: "/tiles/watermark-remover.webp",
    icon: BrushCleaning,
    category: "ai",
  },
  {
    href: "/outpainting",
    name: "Outpainting",
    description: "Extend a photo beyond its edges.",
    image: "/tiles/outpainting.webp",
    icon: Expand,
    category: "ai",
    comingSoon: true,
  },
  {
    href: "/resize-convert",
    name: "Resize, Compress & Convert",
    description: "Resize, shrink to a target size and convert between JPG, PNG and WebP.",
    image: "/tiles/resize-convert.webp",
    icon: Scaling,
    category: "edit",
  },
  {
    href: "/passport-photo",
    name: "Passport & ID Photo",
    description: "Passport and visa photos on white, with a printable 6×4 sheet.",
    image: "/tiles/passport-photo.webp",
    icon: IdCard,
    category: "edit",
  },
  {
    href: "/watermark",
    name: "Watermark & Add Text",
    description: "Add a text or logo watermark to one photo or a whole batch.",
    image: "/tiles/watermark.webp",
    icon: Stamp,
    category: "edit",
  },
  {
    href: "/images-to-pdf",
    name: "Images to PDF",
    description: "Combine images into one PDF in the order you choose.",
    image: "/tiles/images-to-pdf.webp",
    icon: FileText,
    category: "edit",
  },
  {
    href: "/remove-metadata",
    name: "Remove Photo Metadata",
    description: "Strip GPS location, camera details and other EXIF data before you share.",
    image: "/tiles/remove-metadata.webp",
    icon: ShieldCheck,
    category: "privacy",
  },
  {
    href: "/prompt-reader",
    name: "Prompt Reader",
    description: "See the prompt, seed, model and settings saved inside a Stable Diffusion image.",
    image: "/tiles/prompt-reader.webp",
    icon: FileSearch,
    category: "privacy",
  },
  {
    href: "/ai-shield",
    name: "AI Shield",
    description: "Cloak your art against AI mimicry and tag it as not for AI training.",
    image: "/tiles/ai-shield.webp",
    icon: ShieldHalf,
    category: "privacy",
  },
];

export function toolByHref(href: string) {
  return TOOLS.find((tool) => tool.href === href);
}

/** Categories that have at least one tool, each with its tools */
export function toolGroups() {
  return CATEGORIES.map((category) => ({
    ...category,
    tools: TOOLS.filter((tool) => tool.category === category.id),
  })).filter((group) => group.tools.length > 0);
}
