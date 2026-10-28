"use client";

import { useEffect, useRef, useState } from "react";
import { Brush, Eraser, ScanText, Trash2, Undo2 } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import ToolResult from "../components/tool-result";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToolAPI } from "@/lib/api";
import { baseName, canvasToBlob, createCanvas, loadImage } from "@/lib/image-utils";

// Shown at half opacity over the photo; only where the mask is painted matters
const MASK_COLOR = "#ef4444";
const MAX_UNDO = 10;

type Tool = "brush" | "eraser";

export default function WatermarkRemoverPage() {
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(28);
  const [detecting, setDetecting] = useState(false);
  const [note, setNote] = useState("");
  const [painted, setPainted] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // The image the latest result belongs to
  const [submitted, setSubmitted] = useState<File | null>(null);
  // Set when the new image is a previous result: don't look for text again by itself
  const skipDetect = useRef(false);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const undoStack = useRef<ImageData[]>([]);
  const stroke = useRef<{ x: number; y: number } | null>(null);
  const { run, isProcessing, status, error, resultUrl, jobId } = useToolJob("watermark-removal");

  useEffect(() => {
    setSize(null);
    setNote("");
    setPainted(false);
    undoStack.current = [];
    setUndoCount(0);
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    let cancelled = false;
    loadImage(image)
      .then((bitmap) => {
        if (!cancelled) setSize({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch((e) => setNote(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [image]);

  // Size the mask to the image, then look for watermark text
  useEffect(() => {
    const canvas = maskRef.current;
    if (!size || !canvas) return;
    canvas.width = size.width;
    canvas.height = size.height;
    if (skipDetect.current) {
      skipDetect.current = false;
      setNote("Paint over anything that's left, then remove it.");
    } else {
      detect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // Undo reads the mask back after every stroke
  const context = () => maskRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;

  const saveUndo = () => {
    const canvas = maskRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
  };

  const undo = () => {
    const data = undoStack.current.pop();
    if (data) context()?.putImageData(data, 0, 0);
    setUndoCount(undoStack.current.length);
  };

  const clear = () => {
    const canvas = maskRef.current;
    if (!canvas) return;
    saveUndo();
    context()?.clearRect(0, 0, canvas.width, canvas.height);
    setPainted(false);
  };

  const detect = async () => {
    const ctx = context();
    if (!image || !size || !ctx) return;
    setDetecting(true);
    setNote("Looking for watermark text...");
    try {
      const found = await ToolAPI.detectWatermark(image);
      saveUndo();
      const sx = size.width / found.width;
      const sy = size.height / found.height;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = MASK_COLOR;
      for (const box of found.boxes) {
        ctx.beginPath();
        box.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * sx, y * sy) : ctx.lineTo(x * sx, y * sy)));
        ctx.closePath();
        ctx.fill();
      }
      if (found.boxes.length > 0) setPainted(true);
      setNote(
        found.boxes.length > 0
          ? `Marked ${found.boxes.length} text area${found.boxes.length === 1 ? "" : "s"}. Erase any you want to keep, and paint over logos or anything missed.`
          : "No watermark text found. Paint over the watermark with the brush.",
      );
    } catch (e) {
      setNote(`${e instanceof Error ? e.message : String(e)}. Paint over the watermark with the brush.`);
    } finally {
      setDetecting(false);
    }
  };

  /** Pointer position in image pixels, and how many image pixels one screen pixel is */
  const toImage = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    return { x: (e.clientX - rect.left) * ratio, y: (e.clientY - rect.top) * ratio, ratio };
  };

  const paintTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = context();
    const from = stroke.current;
    if (!ctx || !from) return;
    const { x, y, ratio } = toImage(e);
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = ctx.fillStyle = MASK_COLOR;
    ctx.lineWidth = brush * ratio;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    stroke.current = { x, y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (detecting || isProcessing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    saveUndo();
    const { x, y } = toImage(e);
    // A tiny first segment so a single tap leaves a dot
    stroke.current = { x: x + 0.01, y };
    paintTo(e);
    if (tool === "brush") setPainted(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (stroke.current) paintTo(e);
  };

  const endStroke = () => {
    stroke.current = null;
  };

  /** The painted area as white on black, at the image's own size */
  const exportMask = async () => {
    const mask = maskRef.current!;
    const { canvas, ctx } = createCanvas(mask.width, mask.height);
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, "image/png");
  };

  const remove = async () => {
    if (!image) return;
    const formData = new FormData();
    formData.append("file", image);
    formData.append("mask", await exportMask(), "mask.png");
    setSubmitted(image);
    run(formData);
  };

  /** Use the result as the new starting point, to clean up what's left */
  const keepEditing = async () => {
    if (!resultUrl || !image) return;
    const blob = await (await fetch(resultUrl)).blob();
    skipDetect.current = true;
    setImage(new File([blob], `${baseName(image.name)}-cleaned.png`, { type: "image/png" }));
  };

  const toolButton = (id: Tool, label: string, Icon: typeof Brush) => (
    <button
      type="button"
      role="radio"
      aria-checked={tool === id}
      onClick={() => setTool(id)}
      className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm transition-colors ${
        tool === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/watermark-remover" />
      <DropZone maxFiles={1} onFilesChange={(files) => setImage(files[0] ?? null)} />

      {image && (
        <Card className="mt-8 w-full max-w-3xl">
          <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-2" role="radiogroup" aria-label="Brush or eraser">
                {toolButton("brush", "Brush", Brush)}
                {toolButton("eraser", "Eraser", Eraser)}
              </div>
              <label className="flex flex-1 min-w-40 items-center gap-2 text-sm text-muted-foreground">
                Size
                <input
                  type="range"
                  min={4}
                  max={120}
                  value={brush}
                  onChange={(e) => setBrush(Number(e.target.value))}
                  className="flex-1"
                  aria-label="Brush size"
                />
              </label>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={undo} disabled={undoCount === 0} aria-label="Undo">
                  <Undo2 className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={clear} aria-label="Clear the mask">
                  <Trash2 className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={detect} disabled={detecting || !size} className="gap-1.5">
                  <ScanText className="size-4" />
                  Find text
                </Button>
              </div>
            </div>

            <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl || undefined} alt="Your image" className="block max-h-[70vh] max-w-full select-none" draggable={false} />
              <canvas
                ref={maskRef}
                className="absolute inset-0 h-full w-full cursor-none touch-none opacity-50"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onPointerLeave={() => setCursor(null)}
              />
              {cursor && (
                <span
                  className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                  style={{ left: cursor.x - brush / 2, top: cursor.y - brush / 2, width: brush, height: brush }}
                />
              )}
            </div>

            {note && <p className="text-sm text-muted-foreground">{note}</p>}
          </CardContent>
        </Card>
      )}

      <Button className="mt-6" disabled={!image || !painted || isProcessing || detecting} onClick={remove}>
        {isProcessing ? "Working..." : "Remove watermark"}
      </Button>
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {image && resultUrl && submitted === image && (
        <>
          <ToolResult original={image} resultUrl={resultUrl} downloadName={`${baseName(image.name)}-no-watermark-${jobId}.png`} />
          <Button variant="outline" className="mt-3 rounded-full" onClick={keepEditing}>
            Remove more from this result
          </Button>
        </>
      )}

      <p className="mt-10 max-w-xl px-4 text-center text-xs text-muted-foreground">
        Only remove watermarks from images you own or have permission to edit.
      </p>
    </div>
  );
}
