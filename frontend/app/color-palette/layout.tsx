import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Color Picker & Palette from Image: HEX, RGB, HSL | Image Tools",
  description: "Pick any colour from an image and get its HEX, RGB and HSL codes, or extract the image's main colour palette. Free, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
