import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Photo Filters & Adjustments: Brightness, Contrast, B&W | Image Tools",
  description:
    "Adjust brightness, contrast, saturation, warmth and sharpness, or apply black & white, sepia and vintage filters. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
