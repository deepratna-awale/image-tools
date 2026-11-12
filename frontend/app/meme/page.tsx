"use client";

import { useEffect, useRef, useState } from "react";
import { Anton } from "next/font/google";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas } from "@/lib/formats";
import { createCanvas, downloadBlob } from "@/lib/image-utils";
import UndoRedo from "../components/undo-redo";
import { useHistory } from "../components/use-history";

type Style = "classic" | "caption";

interface Meme {
  style: Style;
  top: string;
  bottom: string;
  /** Text height as a percentage of the image width */
  size: number;
  uppercase: boolean;
  color: string;
}

// Impact where the system has it; Anton (a free look-alike) everywhere else, e.g. Linux and Android
const anton = Anton({ weight: "400", subsets: ["latin"] });
const IMPACT = `Impact, ${anton.style.fontFamily}, "Arial Narrow Bold", sans-serif`;

/** Splits text into lines that fit within maxWidth */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function render(image: ImageBitmap, meme: Meme, maxSide?: number) {
  const scale = maxSide ? Math.min(1, maxSide / Math.max(image.width, image.height)) : 1;
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const fontSize = Math.max(12, (width * meme.size) / 100);
  const transform = (text: string) => (meme.uppercase ? text.toUpperCase() : text);

  if (meme.style === "caption") {
    // A white bar above the picture with dark text, as on most modern memes
    const probe = createCanvas(1, 1).ctx;
    probe.font = `600 ${fontSize}px ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif`;
    const lines = meme.top ? wrap(probe, transform(meme.top), width * 0.92) : [];
    const lineHeight = fontSize * 1.25;
    const bar = lines.length ? lines.length * lineHeight + fontSize * 1.2 : 0;
    const { canvas, ctx } = createCanvas(width, height + bar);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, bar);
    ctx.drawImage(image, 0, bar, width, height);
    ctx.font = probe.font;
    ctx.fillStyle = "#111111";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, width * 0.04, fontSize * 0.6 + i * lineHeight));
    return canvas;
  }

  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.font = `${fontSize}px ${IMPACT}`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = fontSize / 7;
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = meme.color;
  const lineHeight = fontSize * 1.05;
  const draw = (text: string, fromTop: boolean) => {
    const lines = wrap(ctx, transform(text), width * 0.94);
    lines.forEach((line, i) => {
      const y = fromTop ? fontSize * 0.25 + (i + 1) * lineHeight - fontSize * 0.15 : height - fontSize * 0.35 - (lines.length - 1 - i) * lineHeight;
      ctx.strokeText(line, width / 2, y);
      ctx.fillText(line, width / 2, y);
    });
  };
  if (meme.top) draw(meme.top, true);
  if (meme.bottom) draw(meme.bottom, false);
  return canvas;
}

export default function MemePage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const history = useHistory<Meme>({ style: "classic", top: "", bottom: "", size: 10, uppercase: true, color: "#ffffff" });
  const meme = history.value;
  const [format, setFormat] = useState<ExportFormat>("jpg");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontReady, setFontReady] = useState(false);
  const update = (patch: Partial<Meme>) => history.set((current) => ({ ...current, ...patch }), Object.keys(patch).join());

  useEffect(() => {
    document.fonts.load(`40px ${anton.style.fontFamily}`).finally(() => setFontReady(true));
  }, []);

  useEffect(() => {
    if (!bitmap || !canvasRef.current) return;
    const result = render(bitmap, meme, 900);
    const canvas = canvasRef.current;
    canvas.width = result.width;
    canvas.height = result.height;
    canvas.getContext("2d")!.drawImage(result, 0, 0);
  }, [bitmap, meme, fontReady]);

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/meme" />
      <span className={`${anton.className} sr-only`}>Meme</span>
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
              <div className="flex gap-2">
                <Button size="sm" variant={meme.style === "classic" ? "default" : "outline"} onClick={() => update({ style: "classic", size: 10, uppercase: true })}>
                  Top & bottom
                </Button>
                <Button size="sm" variant={meme.style === "caption" ? "default" : "outline"} onClick={() => update({ style: "caption", size: 5, uppercase: false })}>
                  Caption above
                </Button>
              </div>
              <textarea
                value={meme.top}
                onChange={(e) => update({ top: e.target.value })}
                placeholder={meme.style === "caption" ? "Caption" : "Top text"}
                className="h-20 rounded-md border bg-background p-2 text-sm"
              />
              {meme.style === "classic" && (
                <textarea value={meme.bottom} onChange={(e) => update({ bottom: e.target.value })} placeholder="Bottom text" className="h-20 rounded-md border bg-background p-2 text-sm" />
              )}
              <Slider label="Text size" min={3} max={20} step={0.5} unit="%" value={meme.size} onChange={(size) => update({ size })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={meme.uppercase} onChange={(e) => update({ uppercase: e.target.checked })} />
                ALL CAPS
              </label>
              {meme.style === "classic" && (
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-muted-foreground">Text colour</span>
                  <input type="color" value={meme.color} onChange={(e) => update({ color: e.target.value })} />
                </label>
              )}
              <div className="pt-2 border-t">
                <FormatSelect value={format} onChange={setFormat} formats={["jpg", "png", "webp"]} />
              </div>
              <SaveButton onClick={async () => downloadBlob(await encodeCanvas(render(bitmap, meme), format, 0.92), `meme.${format}`)} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
