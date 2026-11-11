import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meme Generator: Add Top & Bottom Text to Your Image | Image Tools",
  description: "Make a meme from your own picture: classic top and bottom text or a modern caption bar. Free, no watermark, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
