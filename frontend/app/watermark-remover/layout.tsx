import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watermark Remover | Image Tools",
  description:
    "Remove watermarks, logos, text and date stamps from photos with AI. It finds them by itself and repaints the photo. Free.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
