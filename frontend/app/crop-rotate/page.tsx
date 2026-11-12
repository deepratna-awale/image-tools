"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import UndoRedo from "../components/undo-redo";
import { useHistory } from "../components/use-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, sameFormat } from "@/lib/formats";
import { baseName, createCanvas, downloadBlob } from "@/lib/image-utils";

type FormatChoice = "original" | ExportFormat;
interface Rect { x: number; y: number; w: number; h: number }
type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

interface Shape {
  label: string;
  /** Width / height; null is free, 0 keeps the photo's own shape */
  ratio: number | null;
  /** Exact output size for social media formats */
  size?: [number, number];
}

const SHAPES: Shape[] = [
  { label: "Free", ratio: null },
  { label: "Original", ratio: 0 },
  { label: "Square 1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
];

const SOCIAL: Shape[] = [
  { label: "Instagram post", ratio: 1, size: [1080, 1080] },
  { label: "Instagram portrait", ratio: 4 / 5, size: [1080, 1350] },
  { label: "Story / Reel / TikTok", ratio: 9 / 16, size: [1080, 1920] },
  { label: "YouTube thumbnail", ratio: 16 / 9, size: [1280, 720] },
  { label: "YouTube banner", ratio: 16 / 9, size: [2560, 1440] },
  { label: "X post", ratio: 16 / 9, size: [1600, 900] },
  { label: "X header", ratio: 3, size: [1500, 500] },
  { label: "Facebook cover", ratio: 851 / 315, size: [1702, 630] },
  { label: "Facebook post", ratio: 1.91, size: [1200, 628] },
  { label: "LinkedIn banner", ratio: 4, size: [1584, 396] },
  { label: "LinkedIn post", ratio: 1.91, size: [1200, 627] },
  { label: "Pinterest pin", ratio: 2 / 3, size: [1000, 1500] },
  { label: "Profile picture", ratio: 1, size: [400, 400] },
];

const MIN = 16;

/** Size of the image once rotated by `degrees` (the canvas grows to fit the corners) */
function rotatedSize(w: number, h: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  return { width: Math.round(w * cos + h * sin), height: Math.round(w * sin + h * cos) };
}

/** Draws the source rotated and flipped onto a new canvas */
function transform(source: CanvasImageSource & { width: number; height: number }, degrees: number, flipH: boolean, flipV: boolean) {
  const { width, height } = rotatedSize(source.width, source.height, degrees);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/** The biggest rectangle with the given ratio that fits inside `bounds`, centred */
function fitRatio(bounds: Rect, ratio: number): Rect {
  let w = bounds.w;
  let h = w / ratio;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * ratio;
  }
  return { x: bounds.x + (bounds.w - w) / 2, y: bounds.y + (bounds.h - h) / 2, w, h };
}

/** After straightening, the part of the rotated canvas that is all photo (no empty corners) */
function innerRect(w: number, h: number, quarter: number, angle: number): Rect {
  const turned = quarter % 2 ? { w: h, h: w } : { w, h };
  const outer = rotatedSize(w, h, quarter * 90 + angle);
  const a = Math.abs((angle * Math.PI) / 180);
  const s = Math.min(
    turned.w / (turned.w * Math.cos(a) + turned.h * Math.sin(a)),
    turned.h / (turned.w * Math.sin(a) + turned.h * Math.cos(a)),
  );
  const iw = turned.w * s;
  const ih = turned.h * s;
  return { x: (outer.width - iw) / 2, y: (outer.height - ih) / 2, w: iw, h: ih };
}

function dragRect(start: Rect, handle: Handle, dx: number, dy: number, ratio: number | null, W: number, H: number): Rect {
  if (handle === "move") {
    return {
      ...start,
      x: Math.min(Math.max(0, start.x + dx), W - start.w),
      y: Math.min(Math.max(0, start.y + dy), H - start.h),
    };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle.includes("w")) left = Math.min(Math.max(0, left + dx), right - MIN);
  if (handle.includes("e")) right = Math.max(Math.min(W, right + dx), left + MIN);
  if (handle.includes("n")) top = Math.min(Math.max(0, top + dy), bottom - MIN);
  if (handle.includes("s")) bottom = Math.max(Math.min(H, bottom + dy), top + MIN);
  if (!ratio) return { x: left, y: top, w: right - left, h: bottom - top };

  const horizontal = handle.includes("e") || handle.includes("w");
  const vertical = handle.includes("n") || handle.includes("s");
  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  // Room available on the side that moves, keeping the opposite side (or the centre) fixed
  const maxW = handle.includes("w") ? start.x + start.w : handle.includes("e") ? W - start.x : 2 * Math.min(cx, W - cx);
  const maxH = handle.includes("n") ? start.y + start.h : handle.includes("s") ? H - start.y : 2 * Math.min(cy, H - cy);
  let w = horizontal ? right - left : (bottom - top) * ratio;
  if (horizontal && vertical) w = Math.max(right - left, (bottom - top) * ratio);
  w = Math.min(w, maxW, maxH * ratio);
  const h = w / ratio;
  const x = handle.includes("w") ? start.x + start.w - w : handle.includes("e") ? start.x : cx - w / 2;
  const y = handle.includes("n") ? start.y + start.h - h : handle.includes("s") ? start.y : cy - h / 2;
  return { x, y, w, h };
}

const HANDLES: { handle: Handle; className: string }[] = [
  { handle: "nw", className: "-left-2 -top-2 cursor-nwse-resize" },
  { handle: "ne", className: "-right-2 -top-2 cursor-nesw-resize" },
  { handle: "sw", className: "-left-2 -bottom-2 cursor-nesw-resize" },
  { handle: "se", className: "-right-2 -bottom-2 cursor-nwse-resize" },
  { handle: "n", className: "left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize" },
  { handle: "s", className: "left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize" },
  { handle: "w", className: "top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize" },
  { handle: "e", className: "top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize" },
];

interface Edit {
  quarter: number;
  angle: number;
  flipH: boolean;
  flipV: boolean;
  shape: Shape;
  crop: Rect;
}

const START: Edit = { quarter: 0, angle: 0, flipH: false, flipV: false, shape: SHAPES[0], crop: { x: 0, y: 0, w: 0, h: 0 } };

/** Width / height the crop box keeps: null for "Free", the photo's own shape for "Original" */
function ratioOf(shape: Shape, quarter: number, bitmap: ImageBitmap | null) {
  return shape.ratio === 0 && bitmap ? (quarter % 2 ? bitmap.height / bitmap.width : bitmap.width / bitmap.height) : shape.ratio;
}

export default function CropRotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const history = useHistory<Edit>(START);
  const { quarter, angle, flipH, flipV, shape, crop } = history.value;
  const [format, setFormat] = useState<FormatChoice>("original");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: Rect } | null>(null);

  const small = useMemo(() => (bitmap ? previewCanvas(bitmap, 1200).canvas : null), [bitmap]);
  const degrees = quarter * 90 + angle;
  const full = bitmap ? rotatedSize(bitmap.width, bitmap.height, degrees) : { width: 1, height: 1 };
  const ratio = ratioOf(shape, quarter, bitmap);

  // A new crop box that fits the rotated photo and the chosen shape
  const withCrop = (edit: Edit): Edit => {
    if (!bitmap) return edit;
    const size = rotatedSize(bitmap.width, bitmap.height, edit.quarter * 90 + edit.angle);
    const bounds = edit.angle ? innerRect(bitmap.width, bitmap.height, edit.quarter, edit.angle) : { x: 0, y: 0, w: size.width, h: size.height };
    const r = ratioOf(edit.shape, edit.quarter, bitmap);
    return { ...edit, crop: r ? fitRatio(bounds, r) : bounds };
  };
  const change = (patch: Partial<Edit>, group?: string) => history.set((edit) => withCrop({ ...edit, ...patch }), group);

  // Draw the rotated preview
  useEffect(() => {
    if (!small || !canvasRef.current) return;
    const turned = transform(small, degrees, flipH, flipV);
    const canvas = canvasRef.current;
    canvas.width = turned.width;
    canvas.height = turned.height;
    canvas.getContext("2d")!.drawImage(turned, 0, 0);
  }, [small, degrees, flipH, flipV]);

  // A new photo starts with the whole image selected and nothing to undo
  useEffect(() => {
    if (bitmap) history.reset({ ...START, crop: { x: 0, y: 0, w: bitmap.width, h: bitmap.height } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  const toImage = (clientX: number, clientY: number) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: ((clientX - box.left) / box.width) * full.width, y: ((clientY - box.top) / box.height) * full.height };
  };

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const point = toImage(e.clientX, e.clientY);
    drag.current = { handle, startX: point.x, startY: point.y, start: crop };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const point = toImage(e.clientX, e.clientY);
    const { handle, startX, startY, start } = drag.current;
    const next = dragRect(start, handle, point.x - startX, point.y - startY, ratio, full.width, full.height);
    history.set((edit) => ({ ...edit, crop: next }), "crop");
  };

  const save = async () => {
    if (!bitmap || !file) return;
    setIsWorking(true);
    setError("");
    try {
      const turned = transform(bitmap, degrees, flipH, flipV);
      const width = shape.size?.[0] ?? Math.round(crop.w);
      const height = shape.size?.[1] ?? Math.round(crop.h);
      const type = format === "original" ? sameFormat(file) : format;
      const { canvas, ctx } = createCanvas(width, height);
      if (type === "jpg" || type === "bmp") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(turned, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
      downloadBlob(await encodeCanvas(canvas, type, 0.92), `${baseName(file.name)}-cropped.${type}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setIsWorking(false);
  };

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const outW = shape.size?.[0] ?? Math.round(crop.w);
  const outH = shape.size?.[1] ?? Math.round(crop.h);

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/crop-rotate" />
      <DropZone maxFiles={1} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-3">
              <div
                className="relative inline-block overflow-hidden select-none touch-none bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:20px_20px] dark:bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)]"
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
              >
                <canvas ref={canvasRef} className="block max-w-full max-h-[70vh] h-auto" />
                {crop.w > 0 && (
                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
                    style={{
                      left: pct(crop.x, full.width),
                      top: pct(crop.y, full.height),
                      width: pct(crop.w, full.width),
                      height: pct(crop.h, full.height),
                    }}
                    onPointerDown={startDrag("move")}
                  >
                    {/* Rule-of-thirds guides */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }, (_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>
                    {HANDLES.filter(({ handle }) => !ratio || handle.length === 2).map(({ handle, className }) => (
                      <div
                        key={handle}
                        className={`absolute size-4 rounded-sm bg-white border border-primary ${className}`}
                        onPointerDown={startDrag(handle)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                Result: {outW} × {outH} px
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex flex-col gap-5">
              <UndoRedo {...history} />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Rotate & flip</span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => change({ quarter: (quarter + 3) % 4 })} aria-label="Rotate left">
                    <RotateCcw className="size-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => change({ quarter: (quarter + 1) % 4 })} aria-label="Rotate right">
                    <RotateCw className="size-4" />
                  </Button>
                  <Button size="sm" variant={flipH ? "default" : "outline"} onClick={() => history.set((edit) => ({ ...edit, flipH: !edit.flipH }))} aria-label="Flip horizontally">
                    <FlipHorizontal2 className="size-4" />
                  </Button>
                  <Button size="sm" variant={flipV ? "default" : "outline"} onClick={() => history.set((edit) => ({ ...edit, flipV: !edit.flipV }))} aria-label="Flip vertically">
                    <FlipVertical2 className="size-4" />
                  </Button>
                </div>
                <Slider label="Straighten" min={-45} max={45} step={0.5} unit="°" value={angle} onChange={(value) => change({ angle: value }, "angle")} />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Crop shape</span>
                <div className="flex flex-wrap gap-2">
                  {SHAPES.map((option) => (
                    <Button
                      key={option.label}
                      size="sm"
                      variant={shape === option ? "default" : "outline"}
                      onClick={() => change({ shape: option })}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Social media sizes</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={shape.size ? shape.label : ""}
                  onChange={(e) => change({ shape: SOCIAL.find((option) => option.label === e.target.value) ?? SHAPES[0] })}
                >
                  <option value="">Choose a size...</option>
                  {SOCIAL.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label} ({option.size![0]} × {option.size![1]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} extra={[{ value: "original", label: "Same as original" }]} />
                <Button size="sm" variant="ghost" onClick={() => history.set(withCrop(START))}>
                  Reset
                </Button>
              </div>
              <SaveButton onClick={save} disabled={isWorking} label={isWorking ? "Working..." : "Download"} />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
