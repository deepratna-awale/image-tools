"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import Slider from "../components/slider";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IMAGE_ACCEPT } from "@/lib/formats";
import { downloadBlob } from "@/lib/image-utils";
import { RGB, Swatch, extractPalette, textOn, toHex, toHsl } from "@/lib/palette";

function ColorCodes({ rgb, onCopy }: { rgb: RGB; onCopy: (text: string) => void }) {
  const codes = [toHex(rgb), `rgb(${rgb.join(" ")})`, toHsl(rgb)];
  return (
    <div className="flex flex-col gap-1">
      {codes.map((code) => (
        <button key={code} className="flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-sm hover:bg-muted" onClick={() => onCopy(code)}>
          {code}
          <Copy className="size-3 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

export default function ColorPalettePage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const [count, setCount] = useState(6);
  const [picked, setPicked] = useState<RGB | null>(null);
  const [hover, setHover] = useState<RGB | null>(null);
  const [copied, setCopied] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const small = useMemo(() => (bitmap ? previewCanvas(bitmap, 1000) : null), [bitmap]);
  const palette: Swatch[] = useMemo(
    () => (small ? extractPalette(small.ctx.getImageData(0, 0, small.canvas.width, small.canvas.height), count) : []),
    [small, count],
  );

  useEffect(() => {
    if (!small || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = small.canvas.width;
    canvas.height = small.canvas.height;
    canvas.getContext("2d")!.drawImage(small.canvas, 0, 0);
    setPicked(null);
  }, [small]);

  const colorAt = (e: React.PointerEvent): RGB => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - box.left) / box.width) * canvas.width);
    const y = Math.floor(((e.clientY - box.top) / box.height) * canvas.height);
    const [r, g, b] = small!.ctx.getImageData(x, y, 1, 1).data;
    return [r, g, b];
  };

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => {
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  });

  const css = palette.map((swatch, i) => `  --color-${i + 1}: ${toHex(swatch.rgb)};`).join("\n");

  const savePng = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200 * palette.length;
    canvas.height = 260;
    const ctx = canvas.getContext("2d")!;
    palette.forEach((swatch, i) => {
      ctx.fillStyle = toHex(swatch.rgb);
      ctx.fillRect(i * 200, 0, 200, 260);
      ctx.fillStyle = textOn(swatch.rgb);
      ctx.font = "bold 22px ui-monospace, monospace";
      ctx.fillText(toHex(swatch.rgb).toUpperCase(), i * 200 + 20, 236);
    });
    canvas.toBlob((blob) => blob && downloadBlob(blob, "palette.png"), "image/png");
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/color-palette" />
      <DropZone maxFiles={1} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}
      {copied && <p className="mt-3 text-sm text-primary">Copied {copied}</p>}

      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[65vh] h-auto rounded cursor-crosshair"
                onPointerMove={(e) => setHover(colorAt(e))}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => setPicked(colorAt(e as unknown as React.PointerEvent))}
              />
              <p className="text-sm text-muted-foreground">Click anywhere on the image to pick that colour.</p>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-6">
            <Card>
              <CardContent className="p-5 flex items-start gap-4">
                <div
                  className="size-20 shrink-0 rounded-xl border"
                  style={{ background: hover ? toHex(hover) : picked ? toHex(picked) : "transparent" }}
                />
                {picked ? <ColorCodes rgb={picked} onCopy={copy} /> : <p className="text-sm text-muted-foreground">No colour picked yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex flex-col gap-3">
                <span className="text-sm font-medium">Main colours</span>
                <Slider label="Colours" min={2} max={12} value={count} onChange={setCount} />
                <div className="flex h-14 overflow-hidden rounded-lg">
                  {palette.map((swatch) => (
                    <button
                      key={toHex(swatch.rgb)}
                      title={toHex(swatch.rgb)}
                      style={{ background: toHex(swatch.rgb), flexGrow: Math.max(0.05, swatch.share) }}
                      onClick={() => setPicked(swatch.rgb)}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  {palette.map((swatch) => (
                    <button
                      key={toHex(swatch.rgb)}
                      className="flex items-center gap-3 rounded px-1 py-1 text-sm hover:bg-muted"
                      onClick={() => copy(toHex(swatch.rgb))}
                    >
                      <span className="size-5 rounded border" style={{ background: toHex(swatch.rgb) }} />
                      <span className="font-mono">{toHex(swatch.rgb)}</span>
                      <span className="ml-auto text-muted-foreground">{Math.round(swatch.share * 100)}%</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" onClick={() => copy(`:root {\n${css}\n}`)}>
                    Copy as CSS
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copy(JSON.stringify(palette.map((s) => toHex(s.rgb))))}>
                    Copy as JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={savePng}>
                    Save as PNG
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
