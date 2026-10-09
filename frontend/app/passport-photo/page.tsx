"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import { useCutout } from "../components/use-cutout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { baseName, canvasToBlob, createCanvas, downloadBlob, loadImage, setJpegDpi } from "@/lib/image-utils";

const DPI = 300;

interface Preset {
  name: string;
  widthMm: number;
  heightMm: number;
  /** Chin to top of head, as a share of the photo's height */
  head: number;
  /** Space above the head, as a share of the photo's height */
  top: number;
}

// Head sizes are the middle of each country's allowed range
const PRESETS: Preset[] = [
  { name: "US passport & visa (2×2 in)", widthMm: 50.8, heightMm: 50.8, head: 0.59, top: 0.11 },
  { name: "India passport & visa (2×2 in)", widthMm: 50.8, heightMm: 50.8, head: 0.59, top: 0.11 },
  { name: "UK passport (35×45 mm)", widthMm: 35, heightMm: 45, head: 0.7, top: 0.09 },
  { name: "Schengen & EU (35×45 mm)", widthMm: 35, heightMm: 45, head: 0.76, top: 0.07 },
  { name: "Australia passport (35×45 mm)", widthMm: 35, heightMm: 45, head: 0.76, top: 0.07 },
  { name: "Japan passport (35×45 mm)", widthMm: 35, heightMm: 45, head: 0.76, top: 0.07 },
  { name: "Canada passport (50×70 mm)", widthMm: 50, heightMm: 70, head: 0.48, top: 0.14 },
  { name: "China visa (33×48 mm)", widthMm: 33, heightMm: 48, head: 0.635, top: 0.08 },
];

const BACKGROUNDS = [
  { name: "White", color: "#ffffff" },
  { name: "Off-white", color: "#f4f4f2" },
  { name: "Light grey", color: "#e4e6ea" },
  { name: "Light blue", color: "#d6e6f5" },
];

const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);

interface Head {
  /** Top of the head, chin to crown height and head centre, in cutout pixels */
  top: number;
  height: number;
  centerX: number;
}

/** Finds the head in a cutout from the outline of the opaque pixels: the neck is where it narrows before the shoulders */
function findHead(cutout: ImageBitmap): Head {
  const scale = Math.min(1, 400 / cutout.height);
  const { canvas, ctx } = createCanvas(cutout.width * scale, cutout.height * scale);
  ctx.drawImage(cutout, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const left: number[] = [];
  const right: number[] = [];
  for (let y = 0; y < height; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        if (l < 0) l = x;
        r = x;
      }
    }
    left.push(l);
    right.push(r);
  }
  const rowWidth = (y: number) => (left[y] < 0 ? 0 : right[y] - left[y] + 1);

  let top = 0;
  while (top < height - 1 && rowWidth(top) < width * 0.02) top++;
  let bottom = height - 1;
  while (bottom > top && rowWidth(bottom) === 0) bottom--;

  let headWidth = 0;
  let neckWidth = Infinity;
  let neckRow = -1;
  let foundNeck = false;
  for (let y = top; y <= top + (bottom - top) * 0.75; y++) {
    const w = rowWidth(y);
    if (neckRow < 0 && w > headWidth) {
      headWidth = w;
      continue;
    }
    if (w < headWidth * 0.92 && w < neckWidth) {
      neckWidth = w;
      neckRow = y;
    }
    if (neckRow >= 0 && w > neckWidth * 1.25) {
      foundNeck = true;
      break;
    }
  }

  // The chin sits just above the narrowest part of the neck
  let headHeight = (neckRow - top) * 0.94;
  if (!foundNeck || headHeight < headWidth * 0.7 || headHeight > headWidth * 1.9) {
    // Long hair or a wide collar hides the neck. Measure the width over the top of the head instead;
    // heads are about 1.3 times as tall as they are wide
    headWidth = 0;
    for (let y = top; y < bottom && y - top < headWidth * 0.75 + 5; y++) headWidth = Math.max(headWidth, rowWidth(y));
    headHeight = headWidth * 1.3;
  }

  let centerSum = 0;
  let rows = 0;
  for (let y = top; y < top + headHeight; y++) {
    if (left[y] >= 0) {
      centerSum += (left[y] + right[y]) / 2;
      rows++;
    }
  }
  const centerX = rows ? centerSum / rows : width / 2;

  return { top: top / scale, height: headHeight / scale, centerX: centerX / scale };
}

interface Adjust {
  zoom: number;
  x: number;
  y: number;
}

function renderPhoto(cutout: ImageBitmap, head: Head, preset: Preset, background: string, adjust: Adjust) {
  const width = mmToPx(preset.widthMm);
  const height = mmToPx(preset.heightMm);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const scale = ((preset.head * height) / head.height) * adjust.zoom;
  const left = width / 2 - head.centerX * scale + adjust.x * width;
  const top = preset.top * height - head.top * scale + adjust.y * height;
  ctx.drawImage(cutout, left, top, cutout.width * scale, cutout.height * scale);
  return canvas;
}

/** How many copies fit on a 6×4 in sheet, the standard photo print size */
function sheetLayout(photo: HTMLCanvasElement) {
  const width = 6 * DPI;
  const height = 4 * DPI;
  const gap = mmToPx(3);
  const cols = Math.floor((width - gap) / (photo.width + gap));
  const rows = Math.floor((height - gap) / (photo.height + gap));
  return { width, height, gap, cols, rows };
}

function renderSheet(photo: HTMLCanvasElement) {
  const { width, height, gap, cols, rows } = sheetLayout(photo);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const offsetX = (width - cols * photo.width - (cols - 1) * gap) / 2;
  const offsetY = (height - rows * photo.height - (rows - 1) * gap) / 2;
  // Light outlines to cut along
  ctx.strokeStyle = "#c8c8c8";
  ctx.lineWidth = 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(offsetX + col * (photo.width + gap));
      const y = Math.round(offsetY + row * (photo.height + gap));
      ctx.drawImage(photo, x, y);
      ctx.strokeRect(x - 0.5, y - 0.5, photo.width + 1, photo.height + 1);
    }
  }
  return canvas;
}

const sliderClass = "flex items-center gap-3 text-sm";

export default function PassportPhotoPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [background, setBackground] = useState(BACKGROUNDS[0].color);
  const [adjust, setAdjust] = useState<Adjust>({ zoom: 1, x: 0, y: 0 });
  const [subject, setSubject] = useState<{ image: ImageBitmap; head: Head } | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const { run, reset, cutout, isProcessing, status, error } = useCutout();
  const preset = PRESETS[presetIndex];

  useEffect(() => {
    if (!cutout) return;
    let cancelled = false;
    loadImage(cutout).then((image) => {
      if (!cancelled) setSubject({ image, head: findHead(image) });
    });
    return () => {
      cancelled = true;
    };
  }, [cutout]);

  const finalPhoto = useMemo(
    () => (subject ? renderPhoto(subject.image, subject.head, preset, background, adjust) : null),
    [subject, preset, background, adjust],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!finalPhoto) return;
    let cancelled = false;
    canvasToBlob(finalPhoto, "image/jpeg", 0.95).then((blob) => {
      if (!cancelled) setPreviewUrl(URL.createObjectURL(blob));
    });
    return () => {
      cancelled = true;
    };
  }, [finalPhoto]);

  const download = async (sheet: boolean) => {
    if (!finalPhoto || !photo) return;
    const canvas = sheet ? renderSheet(finalPhoto) : finalPhoto;
    const blob = await setJpegDpi(await canvasToBlob(canvas, "image/jpeg", 0.95), DPI);
    downloadBlob(blob, `${baseName(photo.name)}-${sheet ? "print-sheet" : "passport-photo"}.jpg`);
  };

  const setSlider = (key: keyof Adjust) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAdjust((current) => ({ ...current, [key]: Number(e.target.value) }));

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader
        href="/passport-photo"
        description="Upload a front-facing photo against any background. You get a correctly sized photo on a plain background, plus a 6×4 in sheet to print at any photo shop."
      />
      <DropZone
        maxFiles={1}
        onFilesChange={(files) => {
          setPhoto(files[0] ?? null);
          setSubject(null);
          setAdjust({ zoom: 1, x: 0, y: 0 });
          reset();
        }}
      />

      <Card className="mt-8 w-full max-w-2xl mx-4">
        <CardContent className="p-6 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-medium">Document</span>
            <select
              value={presetIndex}
              onChange={(e) => setPresetIndex(Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-3"
            >
              {PRESETS.map((option, i) => (
                <option key={option.name} value={i}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Background</span>
            <div className="flex flex-wrap gap-2">
              {BACKGROUNDS.map((option) => (
                <button
                  key={option.color}
                  type="button"
                  onClick={() => setBackground(option.color)}
                  className={`flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm ${
                    background === option.color ? "border-primary" : "border-muted"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: option.color }} />
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {!subject && (
        <Button className="mt-6" disabled={!photo || isProcessing} onClick={() => photo && run(photo)}>
          {isProcessing ? "Working..." : "Make Photo"}
        </Button>
      )}
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {subject && previewUrl && (
        <div className="mt-8 w-full max-w-3xl px-4 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="relative mx-auto w-full max-w-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Passport photo" className="w-full rounded-md border shadow" />
            {/* Where the top of the head and the chin should land */}
            {[preset.top, preset.top + preset.head].map((line) => (
              <div
                key={line}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-red-500/70"
                style={{ top: `${line * 100}%` }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Line the top of the head and the chin up with the red guides. The guides aren&apos;t in the download.
            </p>
            <label className={sliderClass}>
              <span className="w-20 text-muted-foreground">Size</span>
              <input type="range" min={0.7} max={1.4} step={0.01} value={adjust.zoom} onChange={setSlider("zoom")} className="flex-1" />
            </label>
            <label className={sliderClass}>
              <span className="w-20 text-muted-foreground">Up / down</span>
              <input type="range" min={-0.25} max={0.25} step={0.005} value={adjust.y} onChange={setSlider("y")} className="flex-1" />
            </label>
            <label className={sliderClass}>
              <span className="w-20 text-muted-foreground">Left / right</span>
              <input type="range" min={-0.25} max={0.25} step={0.005} value={adjust.x} onChange={setSlider("x")} className="flex-1" />
            </label>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdjust({ zoom: 1, x: 0, y: 0 })}>
              Reset position
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-full gap-2" onClick={() => download(false)}>
                <Download className="h-4 w-4" />
                Photo
              </Button>
              <Button variant="outline" className="rounded-full gap-2" onClick={() => download(true)}>
                <Download className="h-4 w-4" />
                6×4 in print sheet{finalPhoto ? ` (${copies(finalPhoto)} copies)` : ""}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Rules change, so check your country&apos;s current requirements before printing. Print at 100% scale.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function copies(photo: HTMLCanvasElement) {
  const { cols, rows } = sheetLayout(photo);
  return cols * rows;
}
