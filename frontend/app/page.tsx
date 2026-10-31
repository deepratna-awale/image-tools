import Link from "next/link";
import { CodeXml, Gift, Layers, UserX } from "lucide-react";
import { toolGroups } from "@/lib/tools";
import ToolTile from "./components/tool-tile";

const HIGHLIGHTS = [
  { icon: Gift, title: "Free", text: "Every tool is free to use." },
  { icon: UserX, title: "No sign-up", text: "Open a tool and drop in an image." },
  { icon: Layers, title: "Batch ready", text: "Resize, watermark or clean many images at once." },
  {
    icon: CodeXml,
    title: "Developer API",
    text: "Get a free key and call background removal, upscaling and more from your own apps.",
    href: "/api-keys",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4">
      <section className="flex flex-col items-center gap-6 pt-16 pb-14 text-center sm:pt-24">
        <span className="rounded-full border border-border/70 bg-background/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          Free · No sign-up · Works in your browser
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Every image tool you need,{" "}
          <span className="bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            free
          </span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground text-balance">
          Resize and convert, remove or blur backgrounds, make passport photos and more, all in one place.
        </p>
      </section>

      <div className="flex w-full flex-col gap-14">
        {toolGroups().map(({ id, name, description, tools }) => (
          <section key={id} aria-labelledby={`tools-${id}`} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 id={`tools-${id}`} className="text-2xl font-semibold tracking-tight">
                {name}
              </h2>
              <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {tools.map((tool) => (
                <ToolTile key={tool.href} tool={tool} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map(({ icon: Icon, title, text, href }) => {
          const body = (
            <>
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="flex flex-col gap-1">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </div>
            </>
          );
          const cardClass = "flex gap-3 rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur";
          return href ? (
            <Link
              key={title}
              href={href}
              className={`${cardClass} transition-colors hover:border-primary/60 hover:bg-card`}
            >
              {body}
            </Link>
          ) : (
            <div key={title} className={cardClass}>
              {body}
            </div>
          );
        })}
      </section>
    </main>
  );
}
