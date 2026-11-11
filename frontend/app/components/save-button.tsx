"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureDownload } from "@/lib/image-utils";
import OpenInTool from "./open-in-tool";

/** Rounded "Download" button used under the result of the browser tools, with an "Open in..." menu
 * that sends what the button would save to another tool */
export default function SaveButton({ onClick, label = "Download", disabled }: { onClick: () => unknown; label?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-2">
      <Button className="rounded-full gap-2" onClick={onClick} disabled={disabled}>
        <Download className="h-4 w-4" />
        {label}
      </Button>
      {!disabled && <OpenInTool getFile={() => captureDownload(onClick)} />}
    </div>
  );
}
