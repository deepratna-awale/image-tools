import type { MetadataRoute } from "next";

/** Lets browsers install the site as an app, with its own window and icon */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Image Tools",
    short_name: "Image Tools",
    description: "Free image tools: convert, edit, remove backgrounds and more. No sign-up.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6f1",
    theme_color: "#6d6af5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
