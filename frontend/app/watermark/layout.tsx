import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watermark & Add Text to Photos | Image Tools",
  description: "Add a text or logo watermark to one photo or a whole batch. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
