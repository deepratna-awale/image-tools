"use client";

import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";

export default function SkySwapPage() {
  return (
    <div className="flex flex-col h-full w-full items-center justify-center">
      <h1 className="text-2xl font-bold p-8">Sky Swap</h1>
      <DropZone />
      <Button
        className="mt-6"
        onClick={async () => {
          const response = await fetch("/api/sky-swap", {
            method: "POST",
            // Add body or form data as needed
          });
          // Handle response here
          if (response.ok) {
            // Success logic
          } else {
            // Error handling
          }
        }}
      >
        Swap Sky
      </Button>
    </div>
  );
}
