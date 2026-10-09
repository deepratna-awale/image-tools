import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Images to PDF | Image Tools",
  description: "Combine JPG, PNG and WebP images into one PDF in the order you choose. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
