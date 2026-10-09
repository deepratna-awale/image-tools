import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Remove Photo Metadata (EXIF & Location) | Image Tools",
  description: "Strip GPS location, camera details and other EXIF data from photos before you share them. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
