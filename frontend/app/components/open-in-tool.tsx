"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { handOff } from "@/lib/handoff";
import { toolGroups } from "@/lib/tools";

// Tools that open other kinds of files (PDFs, GIFs) can't take an image result
const NOT_FOR_IMAGES = new Set(["/pdf-to-images", "/gif-editor"]);

/** "Open in..." menu: carries the result over to another tool, ready to work on */
export default function OpenInTool({ getFile }: { getFile: () => Promise<File> }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async (href: string) => {
    setBusy(true);
    setError("");
    try {
      handOff(await getFile());
      router.push(href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const groups = toolGroups()
    .map((group) => ({ ...group, tools: group.tools.filter((t) => !t.comingSoon && t.href !== pathname && !NOT_FOR_IMAGES.has(t.href)) }))
    .filter((group) => group.tools.length);

  return (
    <div className="flex flex-col items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="rounded-full gap-2" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            Open in...
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-[60vh] w-64">
          {groups.map((group, i) => (
            <div key={group.id}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">{group.name}</DropdownMenuLabel>
              {group.tools.map((tool) => (
                <DropdownMenuItem key={tool.href} onSelect={() => open(tool.href)}>
                  <tool.icon className="h-4 w-4" />
                  {tool.name}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
