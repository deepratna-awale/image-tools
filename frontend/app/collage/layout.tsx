import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Photo Collage Maker & Stitch Images Side by Side | Image Tools",
  description: "Make a photo collage from a grid layout, or stitch images side by side or top to bottom. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
