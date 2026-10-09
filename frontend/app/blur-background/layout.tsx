import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blur Background (Portrait Mode) | Image Tools",
  description: "Blur the background of any photo for a portrait-mode look while keeping the subject sharp. Free, no sign-up.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
