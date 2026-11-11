import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Repeat } from "lucide-react";
import QuickConvert from "../../components/quick-convert";
import { CONVERSIONS, conversionBySlug } from "@/lib/conversions";

export const dynamicParams = false;

export function generateStaticParams() {
  return CONVERSIONS.map(({ slug }) => ({ pair: slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }): Promise<Metadata> {
  const conversion = conversionBySlug((await params).pair);
  if (!conversion) return {};
  const { from, to } = conversion;
  return {
    title: `${from.label} to ${to.label} Converter, Free & Private | Image Tools`,
    description: `Convert ${from.label} images to ${to.label} in your browser. Free, no sign-up, no upload: your files never leave your device. Batch convert up to 50 at once.`,
  };
}

export default async function ConvertPairPage({ params }: { params: Promise<{ pair: string }> }) {
  const conversion = conversionBySlug((await params).pair);
  if (!conversion) notFound();
  const { from, to } = conversion;
  const sameFrom = CONVERSIONS.filter((c) => c.from.id === from.id && c.to.id !== to.id);
  const sameTo = CONVERSIONS.filter((c) => c.to.id === to.id && c.from.id !== from.id);

  return (
    <div className="flex flex-col h-full w-full items-center pb-16">
      <div className="flex flex-col items-center gap-3 px-4 pt-10 pb-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary ring-1 ring-primary/20">
          <Repeat className="size-6" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {from.label} to {to.label} Converter
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Convert {from.label} images to {to.label}, one at a time or up to 50 at once. Everything happens in your browser,
          so your files are never uploaded.
        </p>
      </div>

      <QuickConvert to={to.id} />

      <section className="mt-14 w-full max-w-3xl px-4 flex flex-col gap-3 text-sm text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          About {from.label} and {to.label}
        </h2>
        <p>
          {from.label} is {from.about}. {to.label} {to.why}. Need to resize or compress at the same time? Use{" "}
          <Link href="/resize-convert" className="underline">
            Resize, Compress &amp; Convert
          </Link>
          .
        </p>
      </section>

      <section className="mt-10 w-full max-w-3xl px-4 flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">Convert {from.label} to other formats</h2>
          <div className="flex flex-wrap gap-2">
            {sameFrom.map((c) => (
              <Link key={c.slug} href={`/convert/${c.slug}`} className="rounded-full border px-3 py-1 hover:bg-muted">
                {c.from.label} to {c.to.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">Convert other formats to {to.label}</h2>
          <div className="flex flex-wrap gap-2">
            {sameTo.map((c) => (
              <Link key={c.slug} href={`/convert/${c.slug}`} className="rounded-full border px-3 py-1 hover:bg-muted">
                {c.from.label} to {c.to.label}
              </Link>
            ))}
          </div>
        </div>
        <Link href="/convert" className="text-primary underline">
          All conversions
        </Link>
      </section>
    </div>
  );
}
