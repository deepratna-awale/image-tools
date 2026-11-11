import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GIF Editor: Resize, Speed Up, Reverse, Split Frames, GIF to MP4 | Image Tools",
  description:
    "Resize, speed up, slow down, reverse or shrink an animated GIF, split it into frames, or turn it into a video. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
