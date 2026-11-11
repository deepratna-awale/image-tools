import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image to Text (OCR): Copy Text from Photos & Screenshots | Image Tools",
  description:
    "Pull the text out of a photo, scan or screenshot in 12 languages, then copy it, save it as a text file or make a searchable PDF. Free and private: it runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
