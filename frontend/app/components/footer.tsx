import Link from "next/link";
import { toolGroups } from "@/lib/tools";
import { Logo } from "./navbar";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-background/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Free image tools that work in your browser. No sign-up required.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-12">
          {toolGroups().map(({ id, name, tools }) => (
            <div key={id} className="flex flex-col gap-3">
              <span className="text-sm font-medium">{name}</span>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {tools.map(({ href, name }) => (
                  <li key={href}>
                    <Link href={href} className="transition-colors hover:text-foreground">
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Image Tools
      </div>
    </footer>
  );
}
