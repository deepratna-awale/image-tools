import Link from "next/link";
import { Button } from "@/components/ui/button";
import ToolHeader from "../components/tool-header";

export default function OutpaintingPage() {
  return (
    <div className="flex flex-col h-full w-full items-center justify-center gap-2 p-8 text-center">
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Coming soon
      </span>
      <ToolHeader href="/outpainting" description="Extend your photos beyond their edges. This tool isn't available yet." />
      <Button asChild variant="outline" className="mt-2 rounded-full">
        <Link href="/">Back to all tools</Link>
      </Button>
    </div>
  );
}
