"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TOOLS } from "@/lib/tools";
import { ModeToggle } from "./mode-toggle";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-md shadow-primary/30">
        <WandSparkles className="size-4" />
      </span>
      Image Tools
    </Link>
  );
}

function SoonBadge() {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      Soon
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />

        <ul className="hidden items-center gap-1 lg:flex">
          {TOOLS.map(({ href, name, comingSoon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === href && "bg-accent font-medium text-accent-foreground"
                )}
              >
                {name}
                {comingSoon && <SoonBadge />}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full lg:hidden" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {TOOLS.map(({ href, name, icon: Icon, comingSoon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className={cn("gap-2", pathname === href && "font-medium")}>
                    <Icon className="size-4" />
                    {name}
                    {comingSoon && <span className="ml-auto"><SoonBadge /></span>}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
