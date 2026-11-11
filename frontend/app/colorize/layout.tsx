import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Colorize Black & White Photos with AI | Image Tools",
  description: "Turn black and white or sepia photos into colour with AI, and sharpen the faces too. Free, no sign-up.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
