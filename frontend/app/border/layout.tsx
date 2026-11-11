import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Border, Round Corners & Pad to Square | Image Tools",
  description:
    "Add a coloured border, round the corners, crop to a circle or pad a photo to square without cropping. Free, private, runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
