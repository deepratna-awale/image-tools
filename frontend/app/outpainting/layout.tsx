import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Outpainting | Image Tools",
  description:
    "Zoom out or change the shape of a photo to 16:9, square or portrait, and AI paints in what lies beyond its edges. Free.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
