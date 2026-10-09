"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, X } from "lucide-react";
import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canvasToBlob, createCanvas, downloadBlob, formatBytes, loadImage } from "@/lib/image-utils";

type PageSize = "fit" | "a4" | "letter";
type Orientation = "auto" | "portrait" | "landscape";

// Sizes in PDF points (1/72 in)
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS = { none: 0, small: 18, large: 48 } as const;
// Enough pixels to print an A4 page sharply at 300 dpi
const MAX_PIXELS = 3508;

interface Item {
  file: File;
  url: string;
}

function choice<T extends string>(options: [T, string][], value: T, onChange: (value: T) => void) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([option, label]) => (
        <Button key={option} size="sm" variant={value === option ? "default" : "outline"} onClick={() => onChange(option)}>
          {label}
        </Button>
      ))}
    </div>
  );
}

/** Applies the photo's rotation, shrinks very large images and picks JPG unless the image has transparency */
async function prepare(file: File) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_PIXELS / Math.max(image.width, image.height));
  const { canvas, ctx } = createCanvas(image.width * scale, image.height * scale);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const keepTransparency = file.type === "image/png" || file.type === "image/webp";
  const hasAlpha = keepTransparency && ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v < 255);
  const blob = hasAlpha ? await canvasToBlob(canvas, "image/png") : await canvasToBlob(canvas, "image/jpeg", 0.9);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), png: hasAlpha, width: canvas.width, height: canvas.height };
}

export default function ImagesToPdfPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [margin, setMargin] = useState<keyof typeof MARGINS>("small");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Blob | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    return () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  const setFiles = (files: File[]) => {
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems(files.map((file) => ({ file, url: URL.createObjectURL(file) })));
    setResult(null);
  };

  const move = (index: number, by: number) => {
    setResult(null);
    setItems((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  };

  const remove = (index: number) => {
    setResult(null);
    setItems((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  };

  const makePdf = async () => {
    setIsWorking(true);
    setError("");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      for (const { file } of items) {
        const image = await prepare(file);
        const embedded = image.png ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
        const landscapeImage = image.width > image.height;
        let pageWidth: number;
        let pageHeight: number;
        if (pageSize === "fit") {
          // Same shape as the photo, as large as an A4 page
          const scale = PAGE_SIZES.a4[1] / Math.max(image.width, image.height);
          pageWidth = image.width * scale + MARGINS[margin] * 2;
          pageHeight = image.height * scale + MARGINS[margin] * 2;
        } else {
          const [short, long] = PAGE_SIZES[pageSize];
          const landscape = orientation === "auto" ? landscapeImage : orientation === "landscape";
          [pageWidth, pageHeight] = landscape ? [long, short] : [short, long];
        }
        const page = pdf.addPage([pageWidth, pageHeight]);
        const boxWidth = pageWidth - MARGINS[margin] * 2;
        const boxHeight = pageHeight - MARGINS[margin] * 2;
        const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(embedded, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
      }
      const bytes = await pdf.save();
      setResult(new Blob([bytes], { type: "application/pdf" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setIsWorking(false);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <h1 className="text-2xl font-bold p-8">Images to PDF</h1>
      <p className="-mt-6 mb-6 max-w-xl px-4 text-center text-sm text-muted-foreground">
        Combine photos, scans or screenshots into one PDF, in the order you choose. Your files stay in your browser.
      </p>
      <DropZone maxFiles={50} maxSizeMb={50} onFilesChange={setFiles} />

      {items.length > 0 && (
        <div className="mt-8 w-full max-w-3xl px-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {items.map((item, i) => (
            <div key={item.url} className="relative flex flex-col gap-1 rounded-lg border bg-card p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.file.name} className="aspect-[3/4] w-full rounded object-cover bg-muted" />
              <span className="text-xs text-muted-foreground">Page {i + 1}</span>
              <div className="flex justify-between">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(i)} aria-label="Remove">
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move later"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card className="mt-8 w-full max-w-2xl mx-4">
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Page size</span>
            {choice<PageSize>([["a4", "A4"], ["letter", "US Letter"], ["fit", "Same as image"]], pageSize, (v) => { setPageSize(v); setResult(null); })}
          </div>
          {pageSize !== "fit" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Orientation</span>
              {choice<Orientation>([["auto", "Match each image"], ["portrait", "Portrait"], ["landscape", "Landscape"]], orientation, (v) => { setOrientation(v); setResult(null); })}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Margin</span>
            {choice<keyof typeof MARGINS>([["none", "None"], ["small", "Small"], ["large", "Large"]], margin, (v) => { setMargin(v); setResult(null); })}
          </div>
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={items.length === 0 || isWorking} onClick={makePdf}>
        {isWorking ? "Making PDF..." : "Make PDF"}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {result && (
        <Button className="mt-4 rounded-full gap-2" onClick={() => downloadBlob(result, "images.pdf")}>
          <Download className="h-4 w-4" />
          Download PDF ({formatBytes(result.size)})
        </Button>
      )}
    </div>
  );
}
