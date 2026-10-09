import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resize, Compress & Convert Images (JPG, PNG, WebP) | Image Tools",
  description: "Resize photos, compress them to a target size and convert between JPG, PNG and WebP. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
