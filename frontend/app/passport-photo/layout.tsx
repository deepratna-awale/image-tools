import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Passport & ID Photo Maker | Image Tools",
  description: "Make passport and visa photos for the US, India, UK, EU, Canada and more, on a white background with a printable 6×4 sheet. Free.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
