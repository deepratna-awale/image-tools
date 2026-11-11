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
import { Adjustments, NEUTRAL, PRESETS, applyAdjustments } from "@/lib/adjust";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, sameFormat } from "@/lib/formats";
import { baseName, createCanvas, downloadBlob, downloadZip, loadImage } from "@/lib/image-utils";

type FormatChoice = "original" | ExportFormat;

const SLIDERS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "warmth", label: "Warmth", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "hue", label: "Hue", min: -180, max: 180 },
  { key: "sharpen", label: "Sharpen", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", min: 0, max: 100 },
  { key: "fade", label: "Fade", min: 0, max: 100 },
  { key: "grain", label: "Grain", min: 0, max: 100 },
  { key: "sepia", label: "Sepia", min: 0, max: 100 },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100 },
];

export default function AdjustPage() {
  const [files, setFiles] = useState<File[]>([]);
  const { bitmap, error: loadError } = useBitmap(files[0]);
  const [values, setValues] = useState<Adjustments>(NEUTRAL);
  const [preset, setPreset] = useState("Original");
  const [comparing, setComparing] = useState(false);
  const [format, setFormat] = useState<FormatChoice>("original");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);

  // A small copy of the first image, re-filtered on every change
  useEffect(() => {
    baseRef.current = null;
    if (!bitmap) return;
    const { ctx, canvas } = previewCanvas(bitmap, 900);
    baseRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [bitmap]);

  useEffect(() => {
    const base = baseRef.current;
    const canvas = canvasRef.current;
    if (!base || !canvas) return;
    const frame = requestAnimationFrame(() => {
      canvas.width = base.width;
      canvas.height = base.height;
      const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
      if (!comparing) applyAdjustments(copy, values);
      canvas.getContext("2d")!.putImageData(copy, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [values, comparing, bitmap]);

  const set = (key: keyof Adjustments, value: number | boolean) => {
    setPreset("");
    setValues((current) => ({ ...current, [key]: value }));
  };

  const render = async (file: File) => {
    const image = await loadImage(file);
    const { canvas, ctx } = createCanvas(image.width, image.height);
    ctx.drawImage(image, 0, 0);
    image.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustments(pixels, values);
    ctx.putImageData(pixels, 0, 0);
    const type = format === "original" ? sameFormat(file) : format;
    return { name: `${baseName(file.name)}-edited.${type}`, blob: await encodeCanvas(canvas, type, 0.92) };
  };

  const save = async () => {
    setIsWorking(true);
    setError("");
    try {
      const results = [];
      for (const file of files) results.push(await render(file));
      if (results.length === 1) downloadBlob(results[0].blob, results[0].name);
      else await downloadZip(results, "edited-images.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setIsWorking(false);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/adjust" />
      <DropZone maxFiles={20} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={setFiles} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-3">
              <canvas ref={canvasRef} className="max-w-full max-h-[70vh] h-auto rounded-lg" />
              <Button
                size="sm"
                variant="outline"
                onPointerDown={() => setComparing(true)}
                onPointerUp={() => setComparing(false)}
                onPointerLeave={() => setComparing(false)}
              >
                Hold to see the original
              </Button>
              {files.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Preview of the first image; the same settings are applied to all {files.length}.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Filters</span>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((option) => (
                    <Button
                      key={option.name}
                      size="sm"
                      variant={preset === option.name ? "default" : "outline"}
                      onClick={() => {
                        setPreset(option.name);
                        setValues({ ...NEUTRAL, ...option.values });
                      }}
                    >
                      {option.name}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Adjust</span>
                {SLIDERS.map(({ key, label, min, max }) => (
                  <Slider
                    key={key}
                    label={label}
                    min={min}
                    max={max}
                    value={values[key] as number}
                    onChange={(value) => set(key, value)}
                  />
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={values.invert} onChange={(e) => set("invert", e.target.checked)} />
                  Invert colours (negative)
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} extra={[{ value: "original", label: "Same as original" }]} />
                <Button size="sm" variant="ghost" onClick={() => { setValues(NEUTRAL); setPreset("Original"); }}>
                  Reset
                </Button>
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
