import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OutpaintingPage() {
  return (
    <div className="flex flex-col h-full w-full items-center justify-center gap-4 p-8 text-center">
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Coming soon
      </span>
      <h1 className="text-2xl font-bold">Outpainting</h1>
      <p className="max-w-md text-muted-foreground">
        Extend your photos beyond their edges. This tool isn&apos;t available yet.
      </p>
      <Button asChild variant="outline" className="mt-2 rounded-full">
        <Link href="/">Back to all tools</Link>
      </Button>
    </div>
  );
}
