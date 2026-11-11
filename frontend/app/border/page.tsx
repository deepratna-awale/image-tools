"use client";

import { useEffect, useRef, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, sameFormat } from "@/lib/formats";
import { baseName, createCanvas, downloadBlob, downloadZip, drawBlurred, loadImage } from "@/lib/image-utils";

type FormatChoice = "auto" | ExportFormat;

interface Settings {
  /** Pad the photo out to this shape (width / height) without cropping; 0 = no padding */
  padRatio: number;
  padFill: "color" | "blur";
  padColor: string;
  /** Border width and corner radius as a percentage of the shorter side */
  border: number;
  borderColor: string;
  radius: number;
  circle: boolean;
  shadow: boolean;
}

const PAD_SHAPES: [string, number][] = [
  ["None", 0],
  ["Square", 1],
  ["4:5", 4 / 5],
  ["9:16", 9 / 16],
  ["16:9", 16 / 9],
];

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, circle: boolean) {
  ctx.beginPath();
  if (circle) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/** Pads, borders, rounds and shadows the image, in that order */
function frame(image: CanvasImageSource & { width: number; height: number }, s: Settings) {
  // 1. Pad to a shape
  let content: HTMLCanvasElement;
  if (s.padRatio) {
    let w = image.width;
    let h = image.height;
    if (w / h > s.padRatio) h = w / s.padRatio;
    else w = h * s.padRatio;
    const padded = createCanvas(w, h);
    if (s.padFill === "blur") {
      // A zoomed, blurred copy of the photo fills the gap
      const cover = Math.max(w / image.width, h / image.height);
      const blurred = createCanvas(w, h);
      blurred.ctx.drawImage(image, (w - image.width * cover) / 2, (h - image.height * cover) / 2, image.width * cover, image.height * cover);
      drawBlurred(padded.ctx, blurred.canvas, w, h, Math.max(w, h) / 40);
    } else {
      padded.ctx.fillStyle = s.padColor;
      padded.ctx.fillRect(0, 0, w, h);
    }
    padded.ctx.drawImage(image, (w - image.width) / 2, (h - image.height) / 2);
    content = padded.canvas;
  } else {
    content = createCanvas(image.width, image.height).canvas;
    content.getContext("2d")!.drawImage(image, 0, 0);
  }

  // 2. Border and rounded corners
  const short = Math.min(content.width, content.height);
  const border = Math.round((short * s.border) / 100);
  const radius = (short * s.radius) / 100;
  const w = content.width + border * 2;
  const h = content.height + border * 2;
  const framed = createCanvas(w, h);
  framed.ctx.save();
  roundedPath(framed.ctx, 0, 0, w, h, radius, s.circle);
  framed.ctx.clip();
  if (border) {
    framed.ctx.fillStyle = s.borderColor;
    framed.ctx.fillRect(0, 0, w, h);
  }
  roundedPath(framed.ctx, border, border, content.width, content.height, Math.max(0, radius - border), s.circle);
  framed.ctx.clip();
  framed.ctx.drawImage(content, border, border);
  framed.ctx.restore();
  if (!s.shadow) return framed.canvas;

  // 3. Soft drop shadow on a transparent margin
  const margin = Math.round(Math.max(w, h) * 0.06);
  const shadowed = createCanvas(w + margin * 2, h + margin * 2);
  shadowed.ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  shadowed.ctx.shadowBlur = margin * 0.8;
  shadowed.ctx.shadowOffsetY = margin * 0.25;
  shadowed.ctx.drawImage(framed.canvas, margin, margin);
  return shadowed.canvas;
}

const usesTransparency = (s: Settings) => s.radius > 0 || s.circle || s.shadow;

export default function BorderPage() {
  const [files, setFiles] = useState<File[]>([]);
  const { bitmap, error: loadError } = useBitmap(files[0]);
  const [settings, setSettings] = useState<Settings>({
    padRatio: 0,
    padFill: "color",
    padColor: "#ffffff",
    border: 4,
    borderColor: "#ffffff",
    radius: 0,
    circle: false,
    shadow: false,
  });
  const [format, setFormat] = useState<FormatChoice>("auto");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const update = (patch: Partial<Settings>) => setSettings((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (!bitmap || !canvasRef.current) return;
    const frameId = requestAnimationFrame(() => {
      const result = frame(previewCanvas(bitmap, 800).canvas, settings);
      const canvas = canvasRef.current!;
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext("2d")!.drawImage(result, 0, 0);
    });
    return () => cancelAnimationFrame(frameId);
  }, [bitmap, settings]);

  const outputFormat = (file: File): ExportFormat => {
    if (format !== "auto") return format;
    const same = sameFormat(file);
    return usesTransparency(settings) && (same === "jpg" || same === "bmp") ? "png" : same;
  };

  const save = async () => {
    setIsWorking(true);
    setError("");
    try {
      const results = [];
      for (const file of files) {
        const image = await loadImage(file);
        const result = frame(image, settings);
        image.close();
        const type = outputFormat(file);
        if (type === "jpg" || type === "bmp") {
          const flat = createCanvas(result.width, result.height);
          flat.ctx.fillStyle = "#ffffff";
          flat.ctx.fillRect(0, 0, result.width, result.height);
          flat.ctx.drawImage(result, 0, 0);
          results.push({ name: `${baseName(file.name)}-framed.${type}`, blob: await encodeCanvas(flat.canvas, type, 0.92) });
        } else {
          results.push({ name: `${baseName(file.name)}-framed.${type}`, blob: await encodeCanvas(result, type, 0.92) });
        }
      }
      if (results.length === 1) downloadBlob(results[0].blob, results[0].name);
      else await downloadZip(results, "framed-images.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setIsWorking(false);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/border" />
      <DropZone maxFiles={20} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={setFiles} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-3 bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:20px_20px] dark:bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] rounded-xl">
              <canvas ref={canvasRef} className="max-w-full max-h-[70vh] h-auto" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Pad to shape (no cropping)</span>
                <div className="flex flex-wrap gap-2">
                  {PAD_SHAPES.map(([label, ratio]) => (
                    <Button key={label} size="sm" variant={settings.padRatio === ratio ? "default" : "outline"} onClick={() => update({ padRatio: ratio })}>
                      {label}
                    </Button>
                  ))}
                </div>
                {settings.padRatio > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={settings.padFill === "color"} onChange={() => update({ padFill: "color" })} />
                      Colour
                      <input type="color" value={settings.padColor} onChange={(e) => update({ padColor: e.target.value, padFill: "color" })} />
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={settings.padFill === "blur"} onChange={() => update({ padFill: "blur" })} />
                      Blurred photo
                    </label>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Border</span>
                <Slider label="Width" min={0} max={20} step={0.5} unit="%" value={settings.border} onChange={(border) => update({ border })} />
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-muted-foreground">Colour</span>
                  <input type="color" value={settings.borderColor} onChange={(e) => update({ borderColor: e.target.value })} />
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Shape</span>
                <Slider label="Round corners" min={0} max={50} unit="%" value={settings.radius} onChange={(radius) => update({ radius, circle: false })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={settings.circle} onChange={(e) => update({ circle: e.target.checked })} />
                  Circle / oval (pad to square first for a perfect circle)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={settings.shadow} onChange={(e) => update({ shadow: e.target.checked })} />
                  Drop shadow
                </label>
              </div>

              <div className="pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} extra={[{ value: "auto", label: "Same as original (PNG if transparent)" }]} />
              </div>
              <SaveButton
                onClick={save}
                disabled={isWorking}
                label={isWorking ? "Working..." : files.length > 1 ? `Download all ${files.length} (ZIP)` : "Download"}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
