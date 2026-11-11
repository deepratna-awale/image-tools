import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blur or Pixelate Faces, Text & Number Plates | Image Tools",
  description:
    "Hide faces, names, number plates or anything else in a photo with blur, pixelation or a black bar. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
