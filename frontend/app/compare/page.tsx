"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import Slider from "../components/slider";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IMAGE_ACCEPT } from "@/lib/formats";
import { formatBytes } from "@/lib/image-utils";

type Mode = "slider" | "side" | "difference";

export default function ComparePage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const { bitmap: a } = useBitmap(fileA);
  const { bitmap: b } = useBitmap(fileB);
  const [mode, setMode] = useState<Mode>("slider");
  const [position, setPosition] = useState(50);
  const [boost, setBoost] = useState(4);
  const [stats, setStats] = useState("");
  const diffRef = useRef<HTMLCanvasElement>(null);

  // Both drawn at the same size (the first image's shape) so they line up
  const pair = useMemo(() => {
    if (!a || !b) return null;
    const first = previewCanvas(a, 1200);
    const second = document.createElement("canvas");
    second.width = first.canvas.width;
    second.height = first.canvas.height;
    const ctx = second.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(b, 0, 0, second.width, second.height);
    return { a: first.canvas, b: second, aUrl: first.canvas.toDataURL(), bUrl: second.toDataURL() };
  }, [a, b]);

  useEffect(() => {
    if (!pair || mode !== "difference" || !diffRef.current) return;
    const { width, height } = pair.a;
    const da = pair.a.getContext("2d")!.getImageData(0, 0, width, height).data;
    const db = pair.b.getContext("2d")!.getImageData(0, 0, width, height).data;
    const out = new ImageData(width, height);
    let changed = 0;
    let squared = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      for (let c = 0; c < 3; c++) squared += (da[i + c] - db[i + c]) ** 2;
      if (d > 24) changed++;
      // Changed pixels glow magenta over a dimmed copy of the first image
      const gray = (da[i] + da[i + 1] + da[i + 2]) / 12;
      const glow = Math.min(255, (d / 3) * boost);
      out.data[i] = Math.min(255, gray + glow);
      out.data[i + 1] = gray;
      out.data[i + 2] = Math.min(255, gray + glow * 0.8);
      out.data[i + 3] = 255;
    }
    const canvas = diffRef.current;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.putImageData(out, 0, 0);
    const mse = squared / ((da.length / 4) * 3);
    const psnr = mse === 0 ? "identical" : `${(10 * Math.log10((255 * 255) / mse)).toFixed(1)} dB PSNR`;
    setStats(`${((changed / (da.length / 4)) * 100).toFixed(2)}% of pixels differ noticeably · ${psnr}`);
  }, [pair, mode, boost]);

  const info = (file: File | null, bitmap: ImageBitmap | null) =>
    file && bitmap ? `${bitmap.width} × ${bitmap.height} · ${formatBytes(file.size)} · ${file.name.split(".").pop()?.toUpperCase()}` : "";

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/compare" />
      <div className="grid w-full max-w-5xl grid-cols-1 gap-4 px-4 md:grid-cols-2">
        {[
          { label: "First image (before)", set: setFileA, text: info(fileA, a) },
          { label: "Second image (after)", set: setFileB, text: info(fileB, b) },
        ].map(({ label, set, text }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <DropZone maxFiles={1} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={(files) => set(files[0] ?? null)} />
            {text && <span className="text-xs text-muted-foreground">{text}</span>}
          </div>
        ))}
      </div>

      {pair && (
        <div className="mt-8 w-full max-w-5xl px-4 flex flex-col items-center gap-4">
          <div className="flex gap-2">
            {(
              [
                ["slider", "Slider"],
                ["side", "Side by side"],
                ["difference", "Differences"],
              ] as const
            ).map(([value, label]) => (
              <Button key={value} size="sm" variant={mode === value ? "default" : "outline"} onClick={() => setMode(value)}>
                {label}
              </Button>
            ))}
          </div>
          <Card className="w-full">
            <CardContent className="p-4 flex flex-col items-center gap-3">
              {mode === "slider" && (
                <>
                  <div className="relative max-w-full select-none" style={{ aspectRatio: `${pair.a.width} / ${pair.a.height}`, width: Math.min(pair.a.width, 1100) }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pair.bUrl} alt="After" className="absolute inset-0 h-full w-full" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pair.aUrl} alt="Before" className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} />
                    <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }} />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.1}
                      value={position}
                      onChange={(e) => setPosition(Number(e.target.value))}
                      className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                      aria-label="Compare position"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Drag across the image: left is the first image, right the second.</p>
                </>
              )}
              {mode === "side" && (
                <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pair.aUrl} alt="Before" className="w-full rounded" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pair.bUrl} alt="After" className="w-full rounded" />
                </div>
              )}
              {mode === "difference" && (
                <>
                  <canvas ref={diffRef} className="max-w-full max-h-[70vh] h-auto rounded" />
                  <div className="w-full max-w-md">
                    <Slider label="Highlight" min={1} max={20} unit="×" value={boost} onChange={setBoost} />
                  </div>
                  <p className="text-sm text-muted-foreground">{stats}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
