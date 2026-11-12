"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas } from "@/lib/formats";
import { createCanvas, downloadBlob, loadImage } from "@/lib/image-utils";
import UndoRedo from "../components/undo-redo";
import { useHistory } from "../components/use-history";

type Mode = "grid" | "horizontal" | "vertical";
/** Cells as [x, y, w, h] fractions of the canvas */
type Layout = { name: string; count: number; cells: [number, number, number, number][] };

const LAYOUTS: Layout[] = [
  { name: "2 side by side", count: 2, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { name: "2 stacked", count: 2, cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { name: "1 + 2", count: 3, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { name: "2 + 1", count: 3, cells: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { name: "3 in a row", count: 3, cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
  { name: "2 × 2", count: 4, cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { name: "1 + 3", count: 4, cells: [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]] },
  { name: "2 × 3", count: 6, cells: Array.from({ length: 6 }, (_, i) => [(i % 2) / 2, Math.floor(i / 2) / 3, 1 / 2, 1 / 3] as [number, number, number, number]) },
  { name: "3 × 3", count: 9, cells: Array.from({ length: 9 }, (_, i) => [(i % 3) / 3, Math.floor(i / 3) / 3, 1 / 3, 1 / 3] as [number, number, number, number]) },
];

const SHAPES: [string, number][] = [
  ["Square", 1],
  ["4:5", 4 / 5],
  ["3:2", 3 / 2],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
];

interface Options {
  mode: Mode;
  layout: Layout;
  ratio: number;
  /** Long side of a grid collage, or the shared height/width of a stitch */
  size: number;
  gap: number;
  radius: number;
  background: string;
}

/** Draws `image` to fill the box, cropping the overflow from the centre */
function cover(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number, radius: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

function render(images: ImageBitmap[], o: Options, scale = 1) {
  const gap = o.gap * scale;
  const radius = o.radius * scale;
  if (o.mode === "grid") {
    const width = Math.round((o.ratio >= 1 ? o.size : o.size * o.ratio) * scale);
    const height = Math.round((o.ratio >= 1 ? o.size / o.ratio : o.size) * scale);
    const { canvas, ctx } = createCanvas(width, height);
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, width, height);
    const innerW = width - gap;
    const innerH = height - gap;
    o.layout.cells.forEach(([cx, cy, cw, ch], i) => {
      const image = images[i % Math.max(1, images.length)];
      const x = gap + cx * innerW;
      const y = gap + cy * innerH;
      if (image) cover(ctx, image, x, y, cw * innerW - gap, ch * innerH - gap, radius);
    });
    return canvas;
  }
  // Stitch: every image scaled to the same height (side by side) or width (top to bottom)
  const across = o.mode === "horizontal";
  const shared = o.size * scale;
  const lengths = images.map((image) => (across ? (image.width * shared) / image.height : (image.height * shared) / image.width));
  const total = lengths.reduce((sum, length) => sum + length, 0) + gap * (images.length + 1);
  const { canvas, ctx } = createCanvas(across ? total : shared + gap * 2, across ? shared + gap * 2 : total);
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let offset = gap;
  images.forEach((image, i) => {
    const w = across ? lengths[i] : shared;
    const h = across ? shared : lengths[i];
    cover(ctx, image, across ? offset : gap, across ? gap : offset, w, h, radius);
    offset += lengths[i] + gap;
  });
  return canvas;
}

export default function CollagePage() {
  const [images, setImages] = useState<ImageBitmap[]>([]);
  const history = useHistory<{ files: File[]; options: Options }>({
    files: [],
    options: {
      mode: "grid",
      layout: LAYOUTS[5],
      ratio: 1,
      size: 2048,
      gap: 16,
      radius: 0,
      background: "#ffffff",
    },
  });
  const { files, options } = history.value;
  const setFiles = (next: File[]) => history.set((current) => ({ ...current, files: next }));
  const [format, setFormat] = useState<ExportFormat>("jpg");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbs = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => thumbs.forEach((url) => URL.revokeObjectURL(url)), [thumbs]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(files.map((file) => loadImage(file)))
      .then((loaded) => (cancelled ? loaded.forEach((image) => image.close()) : setImages(loaded)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [files]);

  const update = (patch: Partial<Options>) => history.set((current) => ({ ...current, options: { ...current.options, ...patch } }), Object.keys(patch).join());

  useEffect(() => {
    if (!images.length || !canvasRef.current) return;
    const preview = render(images, options, Math.min(1, 900 / (options.mode === "grid" ? options.size : options.size * images.length)));
    const canvas = canvasRef.current;
    canvas.width = preview.width;
    canvas.height = preview.height;
    canvas.getContext("2d")!.drawImage(preview, 0, 0);
  }, [images, options]);

  const move = (i: number, by: number) => {
    const next = [...files];
    const [item] = next.splice(i, 1);
    next.splice(Math.min(Math.max(0, i + by), next.length), 0, item);
    setFiles(next);
  };

  const save = async () => {
    try {
      downloadBlob(await encodeCanvas(render(images, options), format, 0.92), `collage.${format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/collage" />
      <div className="flex gap-2 mb-6">
        {(
          [
            ["grid", "Collage"],
            ["horizontal", "Side by side"],
            ["vertical", "Top to bottom"],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} variant={options.mode === value ? "default" : "outline"} onClick={() => update({ mode: value, size: value === "grid" ? 2048 : 1080 })}>
            {label}
          </Button>
        ))}
      </div>

      <Card className="w-full max-w-3xl mx-4">
        <CardContent className="p-5 flex flex-col gap-3">
          <UndoRedo {...history} />
          <input
            type="file"
            multiple
            accept={`image/*,${Object.values(IMAGE_ACCEPT).flat().join(",")}`}
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 20))}
            className="text-sm"
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="relative flex flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbs[i]} alt={file.name} className="h-16 w-16 rounded-md object-cover bg-muted" />
                  <div className="flex items-center gap-1 text-xs">
                    <button className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, -1)} aria-label="Earlier">
                      <ArrowLeft className="size-3" />
                    </button>
                    {i + 1}
                    <button className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, 1)} aria-label="Later">
                      <ArrowRight className="size-3" />
                    </button>
                  </div>
                  <button className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {images.length > 0 && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex justify-center">
              <canvas ref={canvasRef} className="max-w-full max-h-[70vh] h-auto rounded" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex flex-col gap-4">
              {options.mode === "grid" && (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Layout</span>
                    <div className="flex flex-wrap gap-2">
                      {LAYOUTS.map((layout) => (
                        <Button key={layout.name} size="sm" variant={options.layout === layout ? "default" : "outline"} onClick={() => update({ layout })}>
                          {layout.name}
                        </Button>
                      ))}
                    </div>
                    {images.length < options.layout.count && (
                      <p className="text-xs text-muted-foreground">This layout has {options.layout.count} spots; photos repeat to fill them.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Shape</span>
                    <div className="flex flex-wrap gap-2">
                      {SHAPES.map(([label, ratio]) => (
                        <Button key={label} size="sm" variant={options.ratio === ratio ? "default" : "outline"} onClick={() => update({ ratio })}>
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <Slider
                label={options.mode === "grid" ? "Size" : options.mode === "horizontal" ? "Height" : "Width"}
                min={400}
                max={4096}
                step={8}
                unit=" px"
                value={options.size}
                onChange={(size) => update({ size })}
              />
              <Slider label="Spacing" min={0} max={80} unit=" px" value={options.gap} onChange={(gap) => update({ gap })} />
              <Slider label="Rounding" min={0} max={80} unit=" px" value={options.radius} onChange={(radius) => update({ radius })} />
              <label className="flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground">Background</span>
                <input type="color" value={options.background} onChange={(e) => update({ background: e.target.value })} />
              </label>
              <div className="pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} formats={["jpg", "png", "webp", "avif", "pdf"]} />
              </div>
              <SaveButton onClick={save} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
