"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import DropZone from "./drop-zone";
import Slider from "./slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, formatInfo } from "@/lib/formats";
import { baseName, createCanvas, downloadBlob, downloadZip, formatBytes, loadImage } from "@/lib/image-utils";

interface Converted {
  name: string;
  blob: Blob;
  url: string;
  before: number;
}

/** Drop images, get them back in one fixed format: the body of every "X to Y" page */
export default function QuickConvert({ to }: { to: ExportFormat }) {
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(85);
  const [results, setResults] = useState<Converted[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const info = formatInfo(to);

  useEffect(() => () => results.forEach((result) => URL.revokeObjectURL(result.url)), [results]);

  const convert = async () => {
    setIsWorking(true);
    setError("");
    const converted: Converted[] = [];
    for (const file of files) {
      try {
        const image = await loadImage(file);
        const { canvas, ctx } = createCanvas(image.width, image.height);
        if (!["png", "webp", "avif", "jxl", "gif", "ico", "tiff", "bmp"].includes(to)) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(image, 0, 0);
        image.close();
        const blob = await encodeCanvas(canvas, to, quality / 100);
        converted.push({ name: `${baseName(file.name)}.${to}`, blob, url: URL.createObjectURL(blob), before: file.size });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setResults(converted);
    setIsWorking(false);
  };

  return (
    <div className="flex w-full flex-col items-center">
      <DropZone maxFiles={50} maxSizeMb={100} accept={IMAGE_ACCEPT} onFilesChange={setFiles} />
      {info.lossy && (
        <div className="mt-6 w-full max-w-md px-4">
          <Slider label="Quality" min={10} max={100} value={quality} onChange={setQuality} />
        </div>
      )}
      <Button className="mt-6" size="lg" disabled={!files.length || isWorking} onClick={convert}>
        {isWorking ? "Converting..." : `Convert ${files.length > 1 ? `${files.length} files ` : ""}to ${info.label}`}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {results.length > 0 && (
        <div className="mt-8 w-full max-w-3xl px-4 flex flex-col gap-3">
          {results.map((result) => (
            <Card key={result.url}>
              <CardContent className="p-3 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.url}
                  alt=""
                  className="h-14 w-14 rounded-md object-cover bg-muted"
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium truncate">{result.name}</p>
                  <p className="text-muted-foreground">
                    {formatBytes(result.before)} → {formatBytes(result.blob.size)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => downloadBlob(result.blob, result.name)}>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
          {results.length > 1 && (
            <div className="flex justify-center mt-2">
              <Button className="rounded-full gap-2" onClick={() => downloadZip(results, `converted-to-${to}.zip`)}>
                <Download className="h-4 w-4" />
                Download all (ZIP)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
