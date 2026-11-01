"use client";

import { useEffect, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import ToolResult from "../components/tool-result";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { baseName, loadImage } from "@/lib/image-utils";

// Limits match backend/services/outpainting/processor.py and settings.outpaint_max_output_pixels
const MAX_GROWTH = 3;
const MAX_ASPECT = 4;
const MAX_OUTPUT_PIXELS = 4096 * 4096;
const MAX_PROMPT_LENGTH = 300;

const SHAPES = [
  { id: "same", label: "Same shape", ratio: 0 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "2:3", label: "2:3", ratio: 2 / 3 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "21:9", label: "21:9", ratio: 21 / 9 },
];
const ZOOMS = [1, 1.25, 1.5];
// Where the photo sits on the bigger canvas: 0 = left/top, 1 = centre, 2 = right/bottom
const ANCHORS = [0, 1, 2];

type Size = { width: number; height: number };

/** The canvas and the pixels added on each side, or why it can't be made (mirrors plan_canvas) */
function plan(source: Size | null, ratio: number, zoom: number, anchorX: number, anchorY: number) {
  if (!source) return null;
  const shape = ratio || source.width / source.height;
  const canvasW = Math.max(source.width, Math.round(Math.max(source.width, Math.round(source.height * shape)) * zoom));
  const canvasH = Math.max(source.height, Math.round(Math.max(source.height, Math.round(source.width / shape)) * zoom));
  const extraW = canvasW - source.width;
  const extraH = canvasH - source.height;
  const left = anchorX === 0 ? 0 : anchorX === 1 ? Math.floor(extraW / 2) : extraW;
  const top = anchorY === 0 ? 0 : anchorY === 1 ? Math.floor(extraH / 2) : extraH;
  const sides = { left, top, right: extraW - left, bottom: extraH - top };
  let error = "";
  if (extraW < 2 && extraH < 2) error = "Pick a different shape or zoom out to make room to fill";
  else if (canvasW > MAX_GROWTH * source.width || canvasH > MAX_GROWTH * source.height)
    error = `The new canvas can be at most ${MAX_GROWTH}× the photo's width and height`;
  else if (canvasW / canvasH > MAX_ASPECT || canvasH / canvasW > MAX_ASPECT)
    error = `The new canvas must be between 1:${MAX_ASPECT} and ${MAX_ASPECT}:1`;
  else if (canvasW * canvasH > MAX_OUTPUT_PIXELS)
    error = `${canvasW}×${canvasH} is over the ${(MAX_OUTPUT_PIXELS / 1e6).toFixed(1)} megapixel limit; zoom out less`;
  return { canvasW, canvasH, sides, error };
}

export default function OutpaintingPage() {
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [source, setSource] = useState<Size | null>(null);
  const [shape, setShape] = useState("16:9");
  const [zoom, setZoom] = useState(1);
  const [anchorX, setAnchorX] = useState(1);
  const [anchorY, setAnchorY] = useState(1);
  const [prompt, setPrompt] = useState("");
  // The image the latest result belongs to
  const [submitted, setSubmitted] = useState<File | null>(null);
  const { run, isProcessing, status, error, resultUrl, jobId } = useToolJob("outpainting");

  useEffect(() => {
    setSource(null);
    setImageUrl("");
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    let cancelled = false;
    loadImage(image)
      .then((bitmap) => {
        if (!cancelled) setSource({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [image]);

  const ratio = SHAPES.find((s) => s.id === shape)?.ratio ?? 0;
  const layout = plan(source, ratio, zoom, anchorX, anchorY);
  const growsX = !!layout && layout.canvasW > (source?.width ?? 0);
  const growsY = !!layout && layout.canvasH > (source?.height ?? 0);

  const extend = () => {
    if (!image || !layout || layout.error) return;
    const formData = new FormData();
    formData.append("file", image);
    for (const [side, pixels] of Object.entries(layout.sides)) {
      if (pixels) formData.append(side, String(pixels));
    }
    if (prompt.trim()) formData.append("prompt", prompt.trim());
    setSubmitted(image);
    run(formData);
  };

  const chip = (active: boolean) =>
    `rounded-lg border-2 px-3 py-1.5 text-sm transition-colors ${
      active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
    }`;

  // The preview box: the new canvas's shape, with the photo where it will sit
  const preview = layout && source && imageUrl && (
    <div className="flex justify-center">
      <div
        className="relative w-full max-h-[50vh] overflow-hidden rounded-lg border-2 border-dashed border-primary/50 bg-[repeating-linear-gradient(45deg,transparent_0_10px,var(--muted)_10px_20px)]"
        style={{
          aspectRatio: `${layout.canvasW} / ${layout.canvasH}`,
          maxWidth: `min(100%, calc(50vh * ${layout.canvasW / layout.canvasH}))`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Your photo on the new canvas"
          className="absolute select-none"
          draggable={false}
          style={{
            left: `${(layout.sides.left / layout.canvasW) * 100}%`,
            top: `${(layout.sides.top / layout.canvasH) * 100}%`,
            width: `${(source.width / layout.canvasW) * 100}%`,
            height: `${(source.height / layout.canvasH) * 100}%`,
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/outpainting" />
      <DropZone maxFiles={1} onFilesChange={(files) => setImage(files[0] ?? null)} />

      <Card className="mt-8 w-full max-w-2xl">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">New shape</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New shape">
              {SHAPES.map(({ id, label }) => (
                <button key={id} type="button" role="radio" aria-checked={shape === id} onClick={() => setShape(id)} className={chip(shape === id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Zoom out</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Zoom out">
                {ZOOMS.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={zoom === value} onClick={() => setZoom(value)} className={chip(zoom === value)}>
                    {value === 1 ? "None" : `${value}×`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Photo position</span>
              <div className="grid w-fit grid-cols-3 gap-1" role="radiogroup" aria-label="Photo position">
                {ANCHORS.map((y) =>
                  ANCHORS.map((x) => {
                    const active = (!growsX || anchorX === x) && (!growsY || anchorY === y);
                    return (
                      <button
                        key={`${x}${y}`}
                        type="button"
                        role="radio"
                        aria-checked={anchorX === x && anchorY === y}
                        aria-label={`${["Top", "Middle", "Bottom"][y]} ${["left", "centre", "right"][x]}`}
                        onClick={() => {
                          setAnchorX(x);
                          setAnchorY(y);
                        }}
                        className={`size-7 rounded-md border-2 transition-colors ${
                          anchorX === x && anchorY === y
                            ? "border-primary bg-primary"
                            : active
                              ? "border-primary/60 bg-primary/30"
                              : "border-border hover:border-primary/40"
                        }`}
                      />
                    );
                  }),
                )}
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              What to add <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              type="text"
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. more beach and ocean, a cloudy sky"
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              Leave it empty to simply continue the scene. On busy scenes, new text and people can come out garbled.
            </span>
          </label>

          {preview}

          {source && layout && (
            <p className={`text-sm ${layout.error ? "text-destructive" : "text-muted-foreground"}`}>
              {layout.error || `${source.width}×${source.height} → ${layout.canvasW}×${layout.canvasH}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={!image || !layout || !!layout.error || isProcessing} onClick={extend}>
        {isProcessing ? "Working..." : "Extend image"}
      </Button>
      {status && isProcessing && (
        <p className="mt-3 max-w-md px-4 text-center text-sm text-muted-foreground">
          {status} This takes a few minutes, longer when zooming out a lot or if the GPU has been idle.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {image && resultUrl && submitted === image && (
        <ToolResult original={image} resultUrl={resultUrl} downloadName={`${baseName(image.name)}-extended-${jobId}.png`} />
      )}
    </div>
  );
}
