import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { Logo } from "./navbar";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-background/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:flex-row sm:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Free image tools that work in your browser. No sign-up required.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Tools</span>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
            {TOOLS.map(({ href, name }) => (
              <li key={href}>
                <Link href={href} className="transition-colors hover:text-foreground">
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Image Tools
      </div>
    </footer>
  );
}
