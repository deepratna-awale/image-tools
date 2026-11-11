import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to JPG, PNG or WebP: Convert PDF Pages to Images | Image Tools",
  description: "Turn every page of a PDF into a JPG, PNG or WebP image at up to 300 DPI. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
