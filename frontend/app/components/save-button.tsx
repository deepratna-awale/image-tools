"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Rounded "Download" button used under the result of the browser tools */
export default function SaveButton({ onClick, label = "Download", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <Button className="rounded-full gap-2" onClick={onClick} disabled={disabled}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
