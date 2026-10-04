"use client";

import { useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ToolResultProps {
  original: File;
  resultUrl: string;
  downloadName: string;
}

/** Original and processed image side by side, with a download button */
export default function ToolResult({ original, resultUrl, downloadName }: ToolResultProps) {
  const originalUrl = useMemo(() => URL.createObjectURL(original), [original]);

  useEffect(() => {
    return () => URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);

  return (
    <div className="mt-8 w-full max-w-5xl px-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "Before", url: originalUrl },
          { label: "After", url: resultUrl },
        ].map(({ label, url }) => (
          <Card key={label}>
            <CardContent className="p-4 flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={label} className="w-full max-h-[60vh] object-contain rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex justify-center mt-4">
        <Button asChild className="rounded-full gap-2">
          <a href={resultUrl} download={downloadName}>
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}
