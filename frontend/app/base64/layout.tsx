import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image to Base64 & Base64 to Image Converter | Image Tools",
  description: "Encode an image as a Base64 data URI for HTML, CSS or JSON, or decode Base64 back into an image file. Free, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
