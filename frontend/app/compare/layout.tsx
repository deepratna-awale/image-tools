import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Two Images: Before/After Slider & Difference | Image Tools",
  description: "Compare two images with a before/after slider, side by side, or a difference view that highlights every changed pixel. Free, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
