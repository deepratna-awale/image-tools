import type { Metadata } from "next";
import Link from "next/link";
import ToolHeader from "../components/tool-header";
import { CONVERSIONS, INPUTS, POPULAR, conversionBySlug } from "@/lib/conversions";

export const metadata: Metadata = {
  title: "Image Format Converter: HEIC, WebP, AVIF, PNG, JPG, PDF and more | Image Tools",
  description:
    "Convert between HEIC, JPG, PNG, WebP, AVIF, JPEG XL, GIF, SVG, TIFF, BMP, ICO, PSD, camera RAW and PDF. Free, private, runs in your browser.",
};

export default function ConvertHub() {
  return (
    <div className="flex flex-col h-full w-full items-center pb-16">
      <ToolHeader href="/convert" />
      <div className="w-full max-w-5xl px-4 flex flex-col gap-10">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Popular conversions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {POPULAR.map((slug) => conversionBySlug(slug)!).map((c) => (
              <Link key={c.slug} href={`/convert/${c.slug}`} className="rounded-xl border bg-card px-4 py-3 font-medium hover:border-primary/50">
                {c.from.label} to {c.to.label}
              </Link>
            ))}
          </div>
        </section>
        {INPUTS.map((from) => (
          <section key={from.id} className="flex flex-col gap-2">
            <h2 className="font-semibold">From {from.label}</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {CONVERSIONS.filter((c) => c.from.id === from.id).map((c) => (
                <Link key={c.slug} href={`/convert/${c.slug}`} className="rounded-full border px-3 py-1 hover:bg-muted">
                  {c.from.label} to {c.to.label}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
