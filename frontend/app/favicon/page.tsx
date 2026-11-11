"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IMAGE_ACCEPT, encodeCanvas } from "@/lib/formats";
import { createCanvas, downloadZip } from "@/lib/image-utils";

type Source = "image" | "text";

interface Design {
  source: Source;
  text: string;
  textColor: string;
  transparent: boolean;
  background: string;
  /** Empty space around the artwork, % of the icon */
  padding: number;
  /** Corner rounding, % of the icon (50 = circle) */
  radius: number;
}

const FILES: [string, number][] = [
  ["favicon-16x16.png", 16],
  ["favicon-32x32.png", 32],
  ["apple-touch-icon.png", 180],
  ["android-chrome-192x192.png", 192],
  ["android-chrome-512x512.png", 512],
];

const SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;

function drawIcon(size: number, design: Design, image: ImageBitmap | null, opaque = false) {
  const { canvas, ctx } = createCanvas(size, size);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, (size * design.radius) / 100);
  ctx.clip();
  if (!design.transparent || opaque) {
    ctx.fillStyle = design.transparent ? "#ffffff" : design.background;
    ctx.fillRect(0, 0, size, size);
  }
  const inner = size * (1 - (design.padding * 2) / 100);
  const offset = (size - inner) / 2;
  if (design.source === "image" && image) {
    const scale = inner / Math.max(image.width, image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, offset + (inner - w) / 2, offset + (inner - h) / 2, w, h);
  } else if (design.source === "text" && design.text) {
    ctx.fillStyle = design.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = inner;
    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    const width = ctx.measureText(design.text).width;
    if (width > inner) fontSize *= inner / width;
    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillText(design.text, size / 2, size / 2 + fontSize * 0.05);
  }
  ctx.restore();
  return canvas;
}

export default function FaviconPage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const [design, setDesign] = useState<Design>({
    source: "image",
    text: "A",
    textColor: "#ffffff",
    transparent: true,
    background: "#6d6af5",
    padding: 0,
    radius: 0,
  });
  const [appName, setAppName] = useState("My site");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const previews = useRef<(HTMLCanvasElement | null)[]>([]);

  const update = (patch: Partial<Design>) => setDesign((current) => ({ ...current, ...patch }));
  const ready = design.source === "text" ? !!design.text : !!bitmap;
  const sizes = useMemo(() => [16, 32, 64, 180], []);

  useEffect(() => {
    sizes.forEach((size, i) => {
      const target = previews.current[i];
      if (!target) return;
      const icon = drawIcon(size, design, bitmap, size === 180);
      target.width = size;
      target.height = size;
      target.getContext("2d")!.drawImage(icon, 0, 0);
    });
  }, [design, bitmap, sizes]);

  const build = async () => {
    setError("");
    try {
      const files: { name: string; blob: Blob }[] = [];
      files.push({ name: "favicon.ico", blob: await encodeCanvas(drawIcon(48, design, bitmap), "ico") });
      for (const [name, size] of FILES) {
        // iOS shows transparent touch icons on black, so that one always gets a background
        files.push({ name, blob: await encodeCanvas(drawIcon(size, design, bitmap, name.startsWith("apple")), "png") });
      }
      const manifest = {
        name: appName,
        short_name: appName,
        icons: [
          { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
        ],
        theme_color: design.transparent ? "#ffffff" : design.background,
        background_color: "#ffffff",
        display: "standalone",
      };
      files.push({ name: "site.webmanifest", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/manifest+json" }) });
      files.push({ name: "favicon-html.txt", blob: new Blob([SNIPPET + "\n"], { type: "text/plain" }) });
      await downloadZip(files, "favicons.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/favicon" />
      <div className="flex gap-2 mb-6">
        <Button variant={design.source === "image" ? "default" : "outline"} onClick={() => update({ source: "image" })}>
          From an image
        </Button>
        <Button variant={design.source === "text" ? "default" : "outline"} onClick={() => update({ source: "text", transparent: false })}>
          From a letter or emoji
        </Button>
      </div>
      {design.source === "image" ? (
        <DropZone maxFiles={1} maxSizeMb={20} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={design.text}
            onChange={(e) => update({ text: e.target.value.slice(0, 3) })}
            className="h-12 w-28 rounded-md border bg-background px-3 text-center text-2xl"
            aria-label="Letters or emoji"
          />
          <label className="flex items-center gap-2 text-sm">
            Text colour <input type="color" value={design.textColor} onChange={(e) => update({ textColor: e.target.value })} />
          </label>
        </div>
      )}
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      <div className="mt-8 w-full max-w-4xl px-4 grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="p-5 flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={design.transparent} onChange={(e) => update({ transparent: e.target.checked })} />
              Transparent background
            </label>
            {!design.transparent && (
              <label className="flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground">Background</span>
                <input type="color" value={design.background} onChange={(e) => update({ background: e.target.value })} />
              </label>
            )}
            <Slider label="Padding" min={0} max={30} unit="%" value={design.padding} onChange={(padding) => update({ padding })} />
            <Slider label="Rounding" min={0} max={50} unit="%" value={design.radius} onChange={(radius) => update({ radius })} />
            <label className="flex items-center gap-3 text-sm">
              <span className="w-24 text-muted-foreground">Site name</span>
              <input value={appName} onChange={(e) => setAppName(e.target.value)} className="h-9 flex-1 rounded-md border bg-background px-3" />
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="flex items-end gap-4 rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-4 dark:bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)]">
              {sizes.map((size, i) => (
                <div key={size} className="flex flex-col items-center gap-1">
                  <canvas
                    ref={(el) => {
                      previews.current[i] = el;
                    }}
                    style={{ width: Math.min(size, 96), height: Math.min(size, 96), imageRendering: size < 64 ? "pixelated" : "auto" }}
                  />
                  <span className="text-[10px] text-muted-foreground">{size}px</span>
                </div>
              ))}
            </div>
            <SaveButton onClick={build} disabled={!ready} label="Download favicon set (ZIP)" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{SNIPPET}</pre>
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1 gap-1"
                onClick={() => navigator.clipboard.writeText(SNIPPET).then(() => setCopied(true))}
              >
                <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Put the files in your site&apos;s root folder and this in the page&apos;s &lt;head&gt;.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
