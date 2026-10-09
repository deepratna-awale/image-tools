import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Shield: Protect Art from AI Training & Mimicry | Image Tools",
  description:
    "Cloak your art or photos against Stable Diffusion style mimicry and img2img, and tag them as not for AI training (IPTC Data Mining, TDMRep, noai). Free.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
