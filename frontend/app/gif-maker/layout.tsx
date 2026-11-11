import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GIF Maker: Images or Video to Animated GIF | Image Tools",
  description: "Make an animated GIF from photos or from a video clip (MP4, MOV, WebM). Set speed, size and looping. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
