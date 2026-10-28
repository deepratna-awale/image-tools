import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watermark Remover | Image Tools",
  description:
    "Remove watermarks, text, date stamps and logos from photos. Finds text by itself; paint over anything else. Free.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
