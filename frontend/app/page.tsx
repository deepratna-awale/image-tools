import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CodeXml, Gift, Layers, UserX } from "lucide-react";
import { TOOLS } from "@/lib/tools";
import { cn } from "@/lib/utils";

const HIGHLIGHTS = [
  { icon: Gift, title: "Free", text: "Every tool is free to use." },
  { icon: UserX, title: "No sign-up", text: "Open a tool and drop in an image." },
  { icon: Layers, title: "Batch ready", text: "Remove backgrounds from 10 images at once." },
  { icon: CodeXml, title: "Developer API", text: "Call background removal from your own apps." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4">
      <section className="flex flex-col items-center gap-6 pt-16 pb-14 text-center sm:pt-24">
        <span className="rounded-full border border-border/70 bg-background/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          Free · No sign-up · Works in your browser
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Edit images in seconds with{" "}
          <span className="bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            AI tools
          </span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground text-balance">
          Remove or change backgrounds, swap skies and read Stable Diffusion prompts, all from one place.
        </p>
      </section>

      <section className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map(({ href, name, description, image, icon: Icon, comingSoon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm backdrop-blur transition duration-300",
              "hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10",
              comingSoon && "opacity-80"
            )}
          >
            <div className="relative aspect-[3/2] overflow-hidden bg-muted">
              <Image
                src={image}
                alt={name}
                fill
                sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                className={cn(
                  "object-cover transition-transform duration-500 group-hover:scale-105",
                  comingSoon && "grayscale-[40%]"
                )}
              />
              {comingSoon && (
                <span className="absolute top-3 right-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow">
                  Coming soon
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <h2 className="font-semibold">{name}</h2>
                <ArrowUpRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="flex flex-col gap-1">
              <span className="font-medium">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
