import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blur Faces in Photos Automatically | Image Tools",
  description:
    "Find and blur every face in a photo automatically, or pixelate them or cover them with a box. Free and private: detection runs in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
