"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FORMAT_EXTENSIONS,
  OutputFormat,
  baseName,
  canvasToBlob,
  createCanvas,
  downloadBlob,
  downloadZip,
  formatBytes,
  loadImage,
} from "@/lib/image-utils";

type FormatChoice = "original" | OutputFormat;
type ResizeMode = "none" | "percent" | "fit";

interface Converted {
  name: string;
  original: File;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: "original", label: "Keep format" },
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

const inputClass = "h-9 rounded-md border bg-background px-3 text-sm";

function outputFormat(file: File, choice: FormatChoice): OutputFormat {
  if (choice !== "original") return choice;
  return file.type in FORMAT_EXTENSIONS ? (file.type as OutputFormat) : "image/png";
}

function targetSize(width: number, height: number, mode: ResizeMode, percent: number, maxW: number, maxH: number) {
  if (mode === "percent") return { width: (width * percent) / 100, height: (height * percent) / 100 };
  if (mode === "fit") {
    const scale = Math.min(1, (maxW || Infinity) / width, (maxH || Infinity) / height);
    return { width: width * scale, height: height * scale };
  }
  return { width, height };
}

function render(image: ImageBitmap, width: number, height: number, format: OutputFormat) {
  const { canvas, ctx } = createCanvas(width, height);
  // JPG has no transparency, so transparent areas become white instead of black
  if (format === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Lowers quality, then size, until the file fits under the target */
async function encodeUnder(image: ImageBitmap, width: number, height: number, format: OutputFormat, maxBytes: number) {
  let scale = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = render(image, width * scale, height * scale, format);
    if (format === "image/png") {
      const blob = await canvasToBlob(canvas, format);
      if (blob.size <= maxBytes) return { blob, canvas };
    } else {
      let low = 0.05;
      let high = 0.95;
      let best: Blob | null = null;
      for (let i = 0; i < 7; i++) {
        const quality = (low + high) / 2;
        const blob = await canvasToBlob(canvas, format, quality);
        if (blob.size <= maxBytes) {
          best = blob;
          low = quality;
        } else {
          high = quality;
        }
      }
      if (best) return { blob: best, canvas };
    }
    scale *= 0.8;
  }
  throw new Error(`Couldn't get the image under ${formatBytes(maxBytes)}`);
}

export default function ResizeConvertPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<FormatChoice>("image/webp");
  const [quality, setQuality] = useState(80);
  const [useTarget, setUseTarget] = useState(false);
  const [targetKb, setTargetKb] = useState(200);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("none");
  const [percent, setPercent] = useState(50);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [results, setResults] = useState<Converted[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => results.forEach((result) => URL.revokeObjectURL(result.url));
  }, [results]);

  const convert = async () => {
    setIsWorking(true);
    setError("");
    setResults([]);
    const converted: Converted[] = [];
    try {
      for (const file of files) {
        const image = await loadImage(file);
        const type = outputFormat(file, format);
        const size = targetSize(image.width, image.height, resizeMode, percent, maxWidth, maxHeight);
        const { blob, canvas } = useTarget
          ? await encodeUnder(image, size.width, size.height, type, targetKb * 1024)
          : await (async () => {
              const canvas = render(image, size.width, size.height, type);
              return { blob: await canvasToBlob(canvas, type, quality / 100), canvas };
            })();
        image.close();
        converted.push({
          name: `${baseName(file.name)}.${FORMAT_EXTENSIONS[type]}`,
          original: file,
          blob,
          url: URL.createObjectURL(blob),
          width: canvas.width,
          height: canvas.height,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setResults(converted);
    setIsWorking(false);
  };

  const lossy = format !== "image/png";

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <h1 className="text-2xl font-bold p-8">Resize, Compress &amp; Convert</h1>
      <p className="-mt-6 mb-6 max-w-xl px-4 text-center text-sm text-muted-foreground">
        Shrink photos, change their size, or convert between JPG, PNG and WebP. Everything happens in your browser, so
        your images are never uploaded.
      </p>
      <DropZone maxFiles={20} maxSizeMb={50} onFilesChange={setFiles} />

      <Card className="mt-8 w-full max-w-2xl mx-4">
        <CardContent className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Save as</span>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={format === option.value ? "default" : "outline"}
                  onClick={() => setFormat(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Size</span>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["none", "Original"],
                  ["percent", "Scale by %"],
                  ["fit", "Fit within"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={resizeMode === value ? "default" : "outline"}
                  onClick={() => setResizeMode(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {resizeMode === "percent" && (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={5}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-12 text-right">{percent}%</span>
              </label>
            )}
            {resizeMode === "fit" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  value={maxWidth || ""}
                  onChange={(e) => setMaxWidth(Number(e.target.value))}
                  className={`${inputClass} w-28`}
                  aria-label="Max width"
                  placeholder="Width"
                />
                ×
                <input
                  type="number"
                  min={1}
                  value={maxHeight || ""}
                  onChange={(e) => setMaxHeight(Number(e.target.value))}
                  className={`${inputClass} w-28`}
                  aria-label="Max height"
                  placeholder="Height"
                />
                <span className="text-muted-foreground">px, keeping the shape</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Compression</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useTarget} onChange={(e) => setUseTarget(e.target.checked)} />
              Make each file smaller than
              <input
                type="number"
                min={10}
                value={targetKb || ""}
                onChange={(e) => setTargetKb(Number(e.target.value))}
                disabled={!useTarget}
                className={`${inputClass} w-24`}
                aria-label="Target size in KB"
              />
              KB
            </label>
            {!useTarget && lossy && (
              <label className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-14">Quality</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-12 text-right">{quality}</span>
              </label>
            )}
            {!useTarget && !lossy && (
              <span className="text-xs text-muted-foreground">PNG is lossless, so only resizing makes it smaller.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={files.length === 0 || isWorking} onClick={convert}>
        {isWorking ? "Working..." : files.length > 1 ? `Convert ${files.length} images` : "Convert"}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {results.length > 0 && (
        <div className="mt-8 w-full max-w-3xl px-4 flex flex-col gap-3">
          {results.map((result) => {
            const saved = 1 - result.blob.size / result.original.size;
            return (
              <Card key={result.url}>
                <CardContent className="p-3 flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.url} alt={result.name} className="h-16 w-16 rounded-md object-cover bg-muted" />
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-medium truncate">{result.name}</p>
                    <p className="text-muted-foreground">
                      {result.width}×{result.height} · {formatBytes(result.original.size)} → {formatBytes(result.blob.size)}
                      {saved > 0.01 && <span className="text-green-600 dark:text-green-400"> ({Math.round(saved * 100)}% smaller)</span>}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => downloadBlob(result.blob, result.name)}>
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {results.length > 1 && (
            <div className="flex justify-center mt-2">
              <Button className="rounded-full gap-2" onClick={() => downloadZip(results, "converted-images.zip")}>
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
