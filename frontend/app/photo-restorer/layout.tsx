import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Restore Old Photos: Fix Blurry Faces & Colorize | Image Tools",
  description:
    "Bring old or blurry photos back to life: AI sharpens faded and damaged faces and colours black and white pictures. Free, no sign-up.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
