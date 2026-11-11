"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import FormatSelect from "../components/format-select";
import SaveButton from "../components/save-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportFormat, encodeCanvas } from "@/lib/formats";
import { baseName, downloadBlob, downloadZip } from "@/lib/image-utils";

interface PageImage {
  name: string;
  blob: Blob;
  url: string;
}

const DPIS = [72, 150, 300];

/** "1-3, 5" -> [1, 2, 3, 5], limited to the document; empty means every page */
function parsePages(text: string, count: number): number[] {
  if (!text.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set<number>();
  for (const part of text.split(",")) {
    const [a, b] = part.split("-").map((n) => parseInt(n.trim(), 10));
    if (Number.isNaN(a)) continue;
    for (let page = a; page <= (Number.isNaN(b) ? a : b); page++) if (page >= 1 && page <= count) pages.add(page);
  }
  return [...pages].sort((x, y) => x - y);
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

export default function PdfToImagesPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<ExportFormat>("jpg");
  const [dpi, setDpi] = useState(150);
  const [range, setRange] = useState("");
  const [pages, setPages] = useState<PageImage[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => pages.forEach((page) => URL.revokeObjectURL(page.url)), [pages]);

  const convert = async () => {
    setError("");
    setPages([]);
    const out: PageImage[] = [];
    try {
      const pdfjs = await loadPdfJs();
      for (const file of files) {
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const wanted = parsePages(range, pdf.numPages);
        for (const number of wanted) {
          setProgress(`${file.name}: page ${number} of ${pdf.numPages}`);
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: dpi / 72 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d")!;
          // PDF pages are white paper; without this, JPG would turn transparent areas black
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const blob = await encodeCanvas(canvas, format, 0.92);
          out.push({ name: `${baseName(file.name)}-page-${number}.${format}`, blob, url: URL.createObjectURL(blob) });
          page.cleanup();
        }
        await pdf.cleanup();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setPages(out);
    setProgress("");
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/pdf-to-images" />
      <DropZone maxFiles={10} maxSizeMb={200} accept={{ "application/pdf": [".pdf"] }} onFilesChange={setFiles} />

      <Card className="mt-8 w-full max-w-2xl mx-4">
        <CardContent className="p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <FormatSelect value={format} onChange={setFormat} formats={["jpg", "png", "webp", "avif", "tiff"]} />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Resolution</span>
              {DPIS.map((value) => (
                <Button key={value} size="sm" variant={dpi === value ? "default" : "outline"} onClick={() => setDpi(value)}>
                  {value} DPI
                </Button>
              ))}
            </div>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Pages</span>
            <input
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="All, or e.g. 1-3, 5"
              className="h-9 w-48 rounded-md border bg-background px-3"
            />
          </label>
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={!files.length || !!progress} onClick={convert}>
        {progress ? "Converting..." : "Convert to images"}
      </Button>
      {progress && <p className="mt-3 text-sm text-muted-foreground">{progress}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {pages.length > 0 && (
        <div className="mt-8 w-full max-w-5xl px-4 flex flex-col items-center gap-6">
          <SaveButton
            onClick={() => (pages.length === 1 ? downloadBlob(pages[0].blob, pages[0].name) : downloadZip(pages, "pdf-pages.zip"))}
            label={pages.length === 1 ? "Download" : `Download all ${pages.length} pages (ZIP)`}
          />
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((page) => (
              <Card key={page.url}>
                <CardContent className="p-3 flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.url} alt={page.name} className="w-full aspect-[3/4] object-contain bg-muted rounded" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => downloadBlob(page.blob, page.name)}>
                    <Download className="h-4 w-4" />
                    {page.name.replace(/^.*-page-/, "Page ").replace(/\.\w+$/, "")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
