"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import { Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CensorMode, Region, censor } from "@/lib/censor";
import { detectFaces } from "@/lib/faces";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, sameFormat } from "@/lib/formats";
import { baseName, downloadBlob } from "@/lib/image-utils";
import UndoRedo from "../components/undo-redo";
import { useHistory } from "../components/use-history";

type FormatChoice = "original" | ExportFormat;

const MODES: [CensorMode, string][] = [
  ["pixelate", "Pixelate"],
  ["blur", "Blur"],
  ["box", "Solid box"],
];

interface Edit {
  regions: Region[];
  mode: CensorMode;
  strength: number;
  boxColor: string;
  oval: boolean;
}

/** Blur & Pixelate, and Face Blur, which is the same tool that starts by finding the faces itself */
export default function CensorTool({ href, faces = false }: { href: string; faces?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const history = useHistory<Edit>({ regions: [], mode: faces ? "blur" : "pixelate", strength: 30, boxColor: "#000000", oval: faces });
  const { regions, mode, strength, boxColor, oval } = history.value;
  const change = (patch: Partial<Edit>, group?: string) => history.set((current) => ({ ...current, ...patch }), group);
  const [drawing, setDrawing] = useState<Region | null>(null);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<number | null>(null);
  const [format, setFormat] = useState<FormatChoice>("original");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const small = useMemo(() => (bitmap ? previewCanvas(bitmap, 1200) : null), [bitmap]);

  const findFaces = async (image: ImageBitmap) => {
    setFinding(true);
    setError("");
    try {
      const detected = await detectFaces(image);
      setFound(detected.length);
      history.set((current) => ({
        ...current,
        regions: [...current.regions, ...detected.filter((d) => !current.regions.some((c) => Math.abs(c.x - d.x) < 2 && Math.abs(c.y - d.y) < 2))],
      }));
    } catch (e) {
      setError(`Couldn't run face detection: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFinding(false);
    }
  };

  useEffect(() => {
    history.reset({ ...history.value, regions: [] });
    setFound(null);
    if (bitmap && faces) findFaces(bitmap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  useEffect(() => {
    if (!small || !canvasRef.current) return;
    const s = small.scale;
    const all = [...regions, ...(drawing ? [drawing] : [])].map((r) => ({ ...r, x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }));
    const result = censor(small.canvas, all, mode, strength, boxColor);
    const canvas = canvasRef.current;
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(result, 0, 0);
    ctx.strokeStyle = "rgba(109, 106, 245, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (const r of all) {
      ctx.beginPath();
      if (r.oval) ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.stroke();
    }
  }, [small, regions, drawing, mode, strength, boxColor]);

  const toImage = (e: React.PointerEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(0, ((e.clientX - box.left) / box.width) * bitmap!.width), bitmap!.width),
      y: Math.min(Math.max(0, ((e.clientY - box.top) / box.height) * bitmap!.height), bitmap!.height),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    start.current = toImage(e);
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const point = toImage(e);
    if (Math.abs(point.x - start.current.x) + Math.abs(point.y - start.current.y) > 6) moved.current = true;
    setDrawing({
      x: Math.min(point.x, start.current.x),
      y: Math.min(point.y, start.current.y),
      w: Math.abs(point.x - start.current.x),
      h: Math.abs(point.y - start.current.y),
      oval,
    });
  };
  const onUp = () => {
    const point = start.current;
    if (point && !moved.current) {
      // A click without dragging removes the area under it (the newest one first)
      const hit = regions.findLastIndex((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
      if (hit >= 0) change({ regions: regions.filter((_, i) => i !== hit) });
    } else if (drawing && drawing.w > 4 && drawing.h > 4) change({ regions: [...regions, drawing] });
    setDrawing(null);
    start.current = null;
  };

  const save = async () => {
    if (!bitmap || !file) return;
    setError("");
    try {
      const type = format === "original" ? sameFormat(file) : format;
      const result = censor(bitmap, regions, mode, strength, boxColor);
      downloadBlob(await encodeCanvas(result, type, 0.92), `${baseName(file.name)}-hidden.${type}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href={href} />
      <DropZone maxFiles={1} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-3">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[70vh] h-auto cursor-crosshair touch-none select-none rounded-lg"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
              />
              <p className="text-sm text-muted-foreground text-center">
                {finding
                  ? "Looking for faces..."
                  : faces && found !== null
                    ? `Found ${found} face${found === 1 ? "" : "s"}. Drag to cover anything missed, click an area to remove it.`
                    : "Drag over each area you want to hide. Click an area to remove it."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex flex-col gap-5">
              <UndoRedo {...history} />
              <Button variant="outline" disabled={finding} onClick={() => bitmap && findFaces(bitmap)}>
                {finding ? <Loader2 className="size-4 animate-spin" /> : <ScanFace className="size-4" />}
                {faces && found !== null ? "Look for faces again" : "Find faces automatically"}
              </Button>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Hide with</span>
                <div className="flex flex-wrap gap-2">
                  {MODES.map(([value, label]) => (
                    <Button key={value} size="sm" variant={mode === value ? "default" : "outline"} onClick={() => change({ mode: value })}>
                      {label}
                    </Button>
                  ))}
                </div>
                {mode === "box" ? (
                  <label className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-muted-foreground">Colour</span>
                    <input type="color" value={boxColor} onChange={(e) => change({ boxColor: e.target.value }, "boxColor")} />
                  </label>
                ) : (
                  <Slider label="Strength" min={5} max={100} value={strength} onChange={(value) => change({ strength: value }, "strength")} />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">New areas</span>
                <div className="flex gap-2">
                  <Button size="sm" variant={!oval ? "default" : "outline"} onClick={() => change({ oval: false })}>
                    Rectangle
                  </Button>
                  <Button size="sm" variant={oval ? "default" : "outline"} onClick={() => change({ oval: true })}>
                    Oval
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {regions.length} area{regions.length === 1 ? "" : "s"}
                </span>
                <Button size="sm" variant="ghost" disabled={!regions.length} onClick={() => change({ regions: [] })}>
                  Clear
                </Button>
              </div>
              <div className="pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} extra={[{ value: "original", label: "Same as original" }]} />
              </div>
              <SaveButton onClick={save} disabled={!regions.length} />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
