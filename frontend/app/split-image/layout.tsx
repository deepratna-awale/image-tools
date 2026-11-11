import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Split Image into Grid Tiles: Instagram Grid & Carousel | Image Tools",
  description: "Cut one image into a grid of tiles (3 × 1, 3 × 3...) for an Instagram grid or a seamless carousel, or into equal pieces. Free, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
