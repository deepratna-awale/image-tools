"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, sameFormat } from "@/lib/formats";
import ImagePicker from "../components/image-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  baseName,
  canvasToBlob,
  createCanvas,
  downloadBlob,
  downloadZip,
  loadImage,
} from "@/lib/image-utils";

type Position = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br" | "tile";

interface Settings {
  kind: "text" | "logo";
  text: string;
  font: string;
  bold: boolean;
  color: string;
  shadow: boolean;
  /** Text height or logo width, as a share of the image width */
  size: number;
  opacity: number;
  position: Position;
}

const FONTS = [
  { label: "Sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Mono", value: "ui-monospace, Menlo, monospace" },
  { label: "Script", value: "'Brush Script MT', 'Segoe Script', cursive" },
];

const GRID: [Position, string][] = [
  ["tl", "Top left"], ["tc", "Top"], ["tr", "Top right"],
  ["ml", "Left"], ["mc", "Centre"], ["mr", "Right"],
  ["bl", "Bottom left"], ["bc", "Bottom"], ["br", "Bottom right"],
];

/** Draws one watermark (text or logo) whose top-left corner is at x, y */
type Stamp = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void };

function textStamp(ctx: CanvasRenderingContext2D, settings: Settings, imageWidth: number): Stamp {
  const fontSize = Math.max(8, (imageWidth * settings.size) / 100);
  const font = `${settings.bold ? "700" : "400"} ${fontSize}px ${settings.font}`;
  ctx.font = font;
  const lines = settings.text.split("\n");
  const lineHeight = fontSize * 1.2;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
  return {
    width,
    height: lineHeight * lines.length,
    draw: (ctx, x, y) => {
      ctx.font = font;
      ctx.fillStyle = settings.color;
      ctx.textBaseline = "middle";
      if (settings.shadow) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = fontSize * 0.12;
        ctx.shadowOffsetY = fontSize * 0.03;
      }
      lines.forEach((line, i) => {
        const lineWidth = ctx.measureText(line).width;
        ctx.fillText(line, x + (width - lineWidth) / 2, y + lineHeight * (i + 0.5));
      });
    },
  };
}

function logoStamp(logo: ImageBitmap, settings: Settings, imageWidth: number): Stamp {
  const width = (imageWidth * settings.size * 4) / 100;
  const height = (width * logo.height) / logo.width;
  return { width, height, draw: (ctx, x, y) => ctx.drawImage(logo, x, y, width, height) };
}

function renderWatermark(image: ImageBitmap, settings: Settings, logo: ImageBitmap | null, format: ExportFormat) {
  const { canvas, ctx } = createCanvas(image.width, image.height);
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0);
  const stamp = settings.kind === "logo" ? (logo ? logoStamp(logo, settings, image.width) : null) : textStamp(ctx, settings, image.width);
  if (!stamp || (settings.kind === "text" && !settings.text.trim())) return canvas;

  ctx.save();
  ctx.globalAlpha = settings.opacity / 100;
  if (settings.position === "tile") {
    // Repeat across the whole image at an angle, so it can't simply be cropped out
    const gapX = stamp.width * 0.6 + image.width * 0.05;
    const gapY = stamp.height * 2.5;
    const diagonal = Math.hypot(image.width, image.height);
    ctx.translate(image.width / 2, image.height / 2);
    ctx.rotate(-Math.PI / 6);
    for (let y = -diagonal / 2, row = 0; y < diagonal / 2; y += stamp.height + gapY, row++) {
      const shift = row % 2 ? (stamp.width + gapX) / 2 : 0;
      for (let x = -diagonal / 2 - shift; x < diagonal / 2; x += stamp.width + gapX) stamp.draw(ctx, x, y);
    }
  } else {
    const margin = Math.min(image.width, image.height) * 0.03;
    const [row, col] = settings.position;
    const x = col === "l" ? margin : col === "r" ? image.width - margin - stamp.width : (image.width - stamp.width) / 2;
    const y = row === "t" ? margin : row === "b" ? image.height - margin - stamp.height : (image.height - stamp.height) / 2;
    stamp.draw(ctx, x, y);
  }
  ctx.restore();
  return canvas;
}



const labelClass = "text-sm text-muted-foreground w-16 shrink-0";

export default function WatermarkPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logo, setLogo] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveAs, setSaveAs] = useState<"original" | ExportFormat>("original");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<Settings>({
    kind: "text",
    text: "© Your Name",
    font: FONTS[0].value,
    bold: true,
    color: "#ffffff",
    shadow: true,
    size: 5,
    opacity: 70,
    position: "br",
  });
  const update = (change: Partial<Settings>) => setSettings((current) => ({ ...current, ...change }));

  useEffect(() => {
    setPreview(null);
    if (!files[0]) return;
    let cancelled = false;
    loadImage(files[0])
      .then((image) => !cancelled && setPreview(image))
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    setLogo(null);
    if (!logoFile) return;
    let cancelled = false;
    loadImage(logoFile)
      .then((image) => !cancelled && setLogo(image))
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [logoFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!preview || !files[0]) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      // A small copy keeps the live preview quick; text and logo scale with the image width
      const scale = Math.min(1, 1200 / preview.width);
      const small = await createImageBitmap(preview, {
        resizeWidth: Math.round(preview.width * scale),
        resizeHeight: Math.round(preview.height * scale),
        resizeQuality: "high",
      });
      const canvas = renderWatermark(small, settings, logo, "png");
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
      if (!cancelled) setPreviewUrl(URL.createObjectURL(blob));
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preview, files, settings, logo]);

  const save = async () => {
    setIsSaving(true);
    setError("");
    try {
      const outputs: { name: string; blob: Blob }[] = [];
      for (const file of files) {
        const image = await loadImage(file);
        const format = saveAs === "original" ? sameFormat(file) : saveAs;
        const canvas = renderWatermark(image, settings, logo, format);
        image.close();
        outputs.push({
          name: `${baseName(file.name)}-watermarked.${format}`,
          blob: await encodeCanvas(canvas, format, 0.92),
        });
      }
      if (outputs.length === 1) downloadBlob(outputs[0].blob, outputs[0].name);
      else await downloadZip(outputs, "watermarked-images.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader
        href="/watermark"
        description="Put your name, a caption or your logo on one photo or a whole batch. It all happens in your browser."
      />
      <DropZone maxFiles={20} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={setFiles} />


      <div className="mt-8 w-full max-w-5xl px-4 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 items-start">
        <Card className="order-2 md:order-1">
          <CardContent className="p-4 flex items-center justify-center min-h-64">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="max-h-[70vh] w-full object-contain rounded-md" />
            ) : (
              <span className="text-sm text-muted-foreground">Add a photo to see a preview</span>
            )}
          </CardContent>
        </Card>

        <Card className="order-1 md:order-2">
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex gap-2">
              {(["text", "logo"] as const).map((kind) => (
                <Button key={kind} size="sm" variant={settings.kind === kind ? "default" : "outline"} onClick={() => update({ kind })}>
                  {kind === "text" ? "Text" : "Logo"}
                </Button>
              ))}
            </div>

            {settings.kind === "text" ? (
              <>
                <textarea
                  value={settings.text}
                  onChange={(e) => update({ text: e.target.value })}
                  rows={2}
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  aria-label="Watermark text"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={settings.font}
                    onChange={(e) => update({ font: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    aria-label="Font"
                  >
                    {FONTS.map((font) => (
                      <option key={font.label} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant={settings.bold ? "default" : "outline"} onClick={() => update({ bold: !settings.bold })}>
                    <b>B</b>
                  </Button>
                  <Button size="sm" variant={settings.shadow ? "default" : "outline"} onClick={() => update({ shadow: !settings.shadow })}>
                    Shadow
                  </Button>
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(e) => update({ color: e.target.value })}
                    className="h-9 w-10 cursor-pointer rounded-md border bg-background"
                    aria-label="Text colour"
                  />
                </div>
              </>
            ) : (
              <ImagePicker file={logoFile} selected={!!logoFile} label="Choose logo" onPick={setLogoFile} onSelect={() => {}} />
            )}

            <label className="flex items-center gap-3">
              <span className={labelClass}>Size</span>
              <input type="range" min={1} max={25} step={0.5} value={settings.size} onChange={(e) => update({ size: Number(e.target.value) })} className="flex-1" />
            </label>
            <label className="flex items-center gap-3">
              <span className={labelClass}>Opacity</span>
              <input type="range" min={5} max={100} value={settings.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} className="flex-1" />
            </label>

            <div className="flex items-start gap-3">
              <span className={labelClass}>Position</span>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-1 w-24">
                  {GRID.map(([position, name]) => (
                    <button
                      key={position}
                      type="button"
                      title={name}
                      aria-label={name}
                      onClick={() => update({ position })}
                      className={`h-7 rounded border ${settings.position === position ? "bg-primary border-primary" : "bg-muted border-border hover:bg-accent"}`}
                    />
                  ))}
                </div>
                <Button size="sm" variant={settings.position === "tile" ? "default" : "outline"} onClick={() => update({ position: "tile" })}>
                  Repeat across
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <FormatSelect value={saveAs} onChange={setSaveAs} extra={[{ value: "original", label: "Same as original" }]} />
      </div>
      <Button className="mt-4 rounded-full gap-2" disabled={files.length === 0 || isSaving} onClick={save}>
        <Download className="h-4 w-4" />
        {isSaving ? "Saving..." : files.length > 1 ? `Download ${files.length} images (ZIP)` : "Download"}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
