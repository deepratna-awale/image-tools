"use client";

import { useEffect, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import ToolResult from "../components/tool-result";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadImage } from "@/lib/image-utils";

// Limits match backend/services/upscaling/processor.py and settings.upscale_max_output_pixels
const MAX_SCALE = 4;
const MAX_OUTPUT_PIXELS = 4096 * 4096;

const SCALES = [1.5, 2, 3, 4];
const SIZES = [
  { label: "Full HD", width: 1920, height: 1080 },
  { label: "4K", width: 3840, height: 2160 },
  { label: "Square", width: 2048, height: 2048 },
  { label: "Portrait 4:5", width: 2160, height: 2700 },
];
const STYLES = [
  { id: "auto", label: "Auto", detail: "Detects anime and art vs. photos" },
  { id: "photo", label: "Photo", detail: "Real photos and renders" },
  { id: "anime", label: "Anime & art", detail: "Drawings, anime, cartoons" },
];

const inputClass = "h-9 rounded-md border bg-background px-3 text-sm";

type Mode = "scale" | "size";

/** The finished size and, when one is wrong, why (mirrors plan_size in the backend) */
function plan(source: { width: number; height: number } | null, mode: Mode, scale: number, width: number, height: number) {
  if (!source) return { size: "", error: "" };
  let factor: number;
  let outW: number;
  let outH: number;
  let scaledW: number;
  let scaledH: number;
  if (mode === "size") {
    if (!width && !height) return { size: "", error: "Enter a width, a height or both" };
    factor = Math.max((width || 0) / source.width, (height || 0) / source.height);
    scaledW = Math.max(width || 0, Math.round(source.width * factor));
    scaledH = Math.max(height || 0, Math.round(source.height * factor));
    outW = width || scaledW;
    outH = height || scaledH;
    if (factor < 1) return { size: "", error: `This image is already larger than ${outW}×${outH}` };
  } else {
    factor = scale;
    if (!(factor >= 1 && factor <= MAX_SCALE)) return { size: "", error: `Scale must be between 1 and ${MAX_SCALE}` };
    scaledW = outW = Math.round(source.width * factor);
    scaledH = outH = Math.round(source.height * factor);
  }
  if (factor > MAX_SCALE) {
    return { size: "", error: `That needs ${factor.toFixed(1)}×; the most is ${MAX_SCALE}× (${source.width * MAX_SCALE}×${source.height * MAX_SCALE})` };
  }
  if (scaledW * scaledH > MAX_OUTPUT_PIXELS) {
    return { size: "", error: `${scaledW}×${scaledH} is over the ${(MAX_OUTPUT_PIXELS / 1e6).toFixed(1)} megapixel limit` };
  }
  const cropped = scaledW !== outW || scaledH !== outH;
  return { size: `${outW}×${outH}${cropped ? " (edges cropped to fit)" : ""}`, error: "" };
}

export default function UpscalerPage() {
  const [image, setImage] = useState<File | null>(null);
  const [source, setSource] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<Mode>("scale");
  const [scale, setScale] = useState(2);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [style, setStyle] = useState("auto");
  const { run, isProcessing, status, error, resultUrl, jobId } = useToolJob("upscaling");

  useEffect(() => {
    setSource(null);
    if (!image) return;
    let cancelled = false;
    loadImage(image)
      .then((bitmap) => {
        if (!cancelled) setSource({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [image]);

  const result = plan(source, mode, scale, width, height);

  const upscale = () => {
    if (!image) return;
    const formData = new FormData();
    formData.append("file", image);
    formData.append("style", style);
    if (mode === "size") {
      if (width) formData.append("width", String(width));
      if (height) formData.append("height", String(height));
    } else {
      formData.append("scale", String(scale));
    }
    run(formData);
  };

  const chip = (active: boolean) =>
    `rounded-lg border-2 px-3 py-1.5 text-sm transition-colors ${
      active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
    }`;

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/upscaler" />
      <DropZone maxFiles={1} onFilesChange={(files) => setImage(files[0] ?? null)} />

      <Card className="mt-8 w-full max-w-xl">
        <CardContent className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to upscale">
              {[
                { id: "scale" as const, label: "By scale" },
                { id: "size" as const, label: "To an exact size" },
              ].map(({ id, label }) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={chip(mode === id)}>
                  {label}
                </button>
              ))}
            </div>

            {mode === "scale" ? (
              <div className="flex flex-wrap items-center gap-2">
                {SCALES.map((value) => (
                  <button key={value} type="button" onClick={() => setScale(value)} className={chip(scale === value)}>
                    {value}×
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={MAX_SCALE}
                  step={0.1}
                  value={scale || ""}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                  aria-label="Custom scale"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((size) => (
                    <button
                      key={size.label}
                      type="button"
                      onClick={() => {
                        setWidth(size.width);
                        setHeight(size.height);
                      }}
                      className={chip(width === size.width && height === size.height)}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={width || ""}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className={`${inputClass} w-28`}
                    aria-label="Width"
                    placeholder="Width"
                  />
                  <span className="text-muted-foreground">×</span>
                  <input
                    type="number"
                    min={1}
                    value={height || ""}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className={`${inputClass} w-28`}
                    aria-label="Height"
                    placeholder="Height"
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  With both set, the image is enlarged to fill the size and the overflow is cropped from the centre.
                  Leave one empty to keep the shape.
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Image type</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Image type">
              {STYLES.map(({ id, label, detail }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={style === id}
                  onClick={() => setStyle(id)}
                  className={`flex flex-col gap-1 rounded-lg border-2 p-2 text-left transition-colors ${
                    style === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </button>
              ))}
            </div>
          </div>

          {source && (
            <p className={`text-sm ${result.error ? "text-destructive" : "text-muted-foreground"}`}>
              {result.error || `${source.width}×${source.height} → ${result.size}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={!image || isProcessing || !!result.error} onClick={upscale}>
        {isProcessing ? "Working..." : "Upscale"}
      </Button>
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {image && resultUrl && (
        <ToolResult original={image} resultUrl={resultUrl} downloadName={`upscaled-${jobId}.png`} />
      )}
    </div>
  );
}
