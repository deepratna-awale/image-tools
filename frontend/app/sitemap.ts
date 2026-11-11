import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { CONVERSIONS } from "@/lib/conversions";
import { TOOLS } from "@/lib/tools";

// Built per request so self-hosted copies list their own address
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const paths = ["", ...TOOLS.filter((tool) => !tool.comingSoon).map((tool) => tool.href), ...CONVERSIONS.map((c) => `/convert/${c.slug}`), "/api-keys", "/privacy", "/terms"];
  return [...new Set(paths)].map((path) => ({ url: `${base}${path}`, changeFrequency: "monthly", priority: path === "" ? 1 : 0.7 }));
}
