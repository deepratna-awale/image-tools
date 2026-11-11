import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image to SVG: Convert PNG or JPG to Vector | Image Tools",
  description: "Trace a PNG or JPG logo, icon or illustration into a scalable SVG vector. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
