import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** Home-page card: square illustration with the tool's name and description under it */
export default function ToolTile({ tool }: { tool: Tool }) {
  const { href, name, description, image, icon: Icon, comingSoon } = tool;

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm backdrop-blur transition duration-300",
        "hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/15",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={image}
          alt=""
          fill
          sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw"
          className={cn(
            "object-cover transition-transform duration-500 group-hover:scale-105",
            comingSoon && "grayscale-[40%]"
          )}
        />
        {comingSoon && (
          <span className="absolute top-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium shadow">
            Coming soon
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <h3 className="text-sm font-semibold leading-tight sm:text-base">{name}</h3>
          <ArrowUpRight className="ml-auto hidden size-4 shrink-0 text-muted-foreground transition group-hover:text-primary sm:block" />
        </div>
        <p className="hidden text-sm leading-snug text-muted-foreground sm:line-clamp-2">{description}</p>
      </div>
    </Link>
  );
}
