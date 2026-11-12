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
import { baseName, createCanvas, downloadZip } from "@/lib/image-utils";
import UndoRedo from "../components/undo-redo";
import { useHistory } from "../components/use-history";

const PRESETS: { label: string; cols: number; rows: number; square: boolean; note: string }[] = [
  { label: "Instagram row (3 × 1)", cols: 3, rows: 1, square: true, note: "Post the tiles from last to first so they line up on your profile." },
  { label: "Instagram grid (3 × 3)", cols: 3, rows: 3, square: true, note: "Post tile 9 first and tile 1 last so the grid reads correctly." },
  { label: "Carousel (3 slides)", cols: 3, rows: 1, square: false, note: "Swipe-through panorama: post the tiles in order as one carousel." },
  { label: "Halves", cols: 2, rows: 1, square: false, note: "" },
  { label: "Quarters", cols: 2, rows: 2, square: false, note: "" },
];

export default function SplitImagePage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const history = useHistory({ cols: 3, rows: 1, square: true, note: PRESETS[0].note });
  const { cols, rows, square, note } = history.value;
  const [format, setFormat] = useState<"original" | ExportFormat>("original");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** The area that gets cut: the whole image, or centre-cropped so every tile is square */
  const area = () => {
    if (!bitmap) return { x: 0, y: 0, w: 0, h: 0 };
    if (!square) return { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    const tile = Math.min(bitmap.width / cols, bitmap.height / rows);
    const w = tile * cols;
    const h = tile * rows;
    return { x: (bitmap.width - w) / 2, y: (bitmap.height - h) / 2, w, h };
  };

  useEffect(() => {
    if (!bitmap || !canvasRef.current) return;
    const { canvas: small, scale } = previewCanvas(bitmap, 900);
    const canvas = canvasRef.current;
    canvas.width = small.width;
    canvas.height = small.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(small, 0, 0);
    const a = area();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, a.y * scale);
    ctx.fillRect(0, (a.y + a.h) * scale, canvas.width, canvas.height);
    ctx.fillRect(0, a.y * scale, a.x * scale, a.h * scale);
    ctx.fillRect((a.x + a.w) * scale, a.y * scale, canvas.width, a.h * scale);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.font = "bold 20px ui-sans-serif, system-ui";
    ctx.fillStyle = "#ffffff";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (a.x + (a.w * c) / cols) * scale;
        const y = (a.y + (a.h * r) / rows) * scale;
        ctx.strokeRect(x, y, (a.w / cols) * scale, (a.h / rows) * scale);
        ctx.fillText(String(r * cols + c + 1), x + 8, y + 26);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, cols, rows, square]);

  const save = async () => {
    if (!bitmap || !file) return;
    setError("");
    try {
      const a = area();
      const type = format === "original" ? sameFormat(file) : format;
      const tiles = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = Math.round(a.x + (a.w * c) / cols);
          const x1 = Math.round(a.x + (a.w * (c + 1)) / cols);
          const y0 = Math.round(a.y + (a.h * r) / rows);
          const y1 = Math.round(a.y + (a.h * (r + 1)) / rows);
          const { canvas, ctx } = createCanvas(x1 - x0, y1 - y0);
          ctx.drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
          tiles.push({ name: `${baseName(file.name)}-${String(r * cols + c + 1).padStart(2, "0")}.${type}`, blob: await encodeCanvas(canvas, type, 0.95) });
        }
      }
      await downloadZip(tiles, `${baseName(file.name)}-tiles.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/split-image" />
      <DropZone maxFiles={1} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}
      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex justify-center">
              <canvas ref={canvasRef} className="max-w-full max-h-[70vh] h-auto rounded" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex flex-col gap-4">
              <UndoRedo {...history} />
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant={cols === preset.cols && rows === preset.rows && square === preset.square ? "default" : "outline"}
                    onClick={() => history.set({ cols: preset.cols, rows: preset.rows, square: preset.square, note: preset.note })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Slider label="Columns" min={1} max={10} value={cols} onChange={(v) => history.set((current) => ({ ...current, cols: v, note: "" }), "cols")} />
              <Slider label="Rows" min={1} max={10} value={rows} onChange={(v) => history.set((current) => ({ ...current, rows: v, note: "" }), "rows")} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={square} onChange={(e) => history.set((current) => ({ ...current, square: e.target.checked }))} />
                Square tiles (crops the edges to fit)
              </label>
              {note && <p className="text-xs text-muted-foreground">{note}</p>}
              <div className="pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} extra={[{ value: "original", label: "Same as original" }]} />
              </div>
              <SaveButton onClick={save} label={`Download ${cols * rows} tiles (ZIP)`} />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
