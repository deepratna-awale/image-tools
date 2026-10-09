"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Tool, toolGroups } from "@/lib/tools";
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

function ToolMenuItem({ tool, active }: { tool: Tool; active: boolean }) {
  const { href, name, icon: Icon, comingSoon } = tool;
  return (
    <DropdownMenuItem asChild>
      <Link href={href} className={cn("gap-2", active && "font-medium text-primary")}>
        <Icon className="size-4" />
        {name}
        {comingSoon && (
          <span className="ml-auto">
            <SoonBadge />
          </span>
        )}
      </Link>
    </DropdownMenuItem>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const groups = toolGroups();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {groups.map(({ id, name, tools }) => {
            const active = tools.some((tool) => tool.href === pathname);
            return (
              <DropdownMenu key={id}>
                <DropdownMenuTrigger
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
                    active && "font-medium text-foreground"
                  )}
                >
                  {name}
                  <ChevronDown className="size-3.5 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {tools.map((tool) => (
                    <ToolMenuItem key={tool.href} tool={tool} active={tool.href === pathname} />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full md:hidden" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {groups.map(({ id, name, tools }, i) => (
                <DropdownMenuGroup key={id}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{name}</DropdownMenuLabel>
                  {tools.map((tool) => (
                    <ToolMenuItem key={tool.href} tool={tool} active={tool.href === pathname} />
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
