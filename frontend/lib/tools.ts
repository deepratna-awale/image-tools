import { Eraser, Expand, FileSearch, ImageIcon, type LucideIcon, Sunset } from "lucide-react";

export interface Tool {
  href: string;
  name: string;
  description: string;
  image: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

/** Every tool on the site, in the order the home page and menus show them */
export const TOOLS: Tool[] = [
  {
    href: "/bg-remover",
    name: "Background Remover",
    description: "Cut out the subject and get a transparent PNG. Up to 10 images at once.",
    image: "/bg-remover.png",
    icon: Eraser,
  },
  {
    href: "/bg-changer",
    name: "Background Changer",
    description: "Put your subject on a new background, a solid colour or your own picture.",
    image: "/bg-changer.png",
    icon: ImageIcon,
  },
  {
    href: "/sky-swap",
    name: "Sky Swap",
    description: "Replace a dull sky with a sunset, golden hour or a sky of your own.",
    image: "/sky-swap.png",
    icon: Sunset,
  },
  {
    href: "/prompt-reader",
    name: "Prompt Reader",
    description: "See the prompt, seed, model and settings saved inside a Stable Diffusion image.",
    image: "/prompt-reader.png",
    icon: FileSearch,
  },
  {
    href: "/outpainting",
    name: "Outpainting",
    description: "Extend a photo beyond its edges.",
    image: "/outpainting.webp",
    icon: Expand,
    comingSoon: true,
  },
];

export function toolByHref(href: string) {
  return TOOLS.find((tool) => tool.href === href);
}
