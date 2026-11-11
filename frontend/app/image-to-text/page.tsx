"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileText, Loader2, ScanText } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IMAGE_ACCEPT } from "@/lib/formats";
import { baseName, createCanvas, downloadBlob } from "@/lib/image-utils";
import { OCR_LANGUAGES, OcrResult, recognizeText } from "@/lib/ocr";

const MAX_LANGUAGES = 3;

export default function ImageToTextPage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const [languages, setLanguages] = useState<string[]>(["eng"]);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ fraction: number; status: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);

  const preview = useMemo(() => (bitmap ? previewCanvas(bitmap, 1400) : null), [bitmap]);

  useEffect(() => {
    setResult(null);
    setText("");
  }, [bitmap]);

  // Draw the image with a box round every word found, tinted by how sure the reader was
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!preview || !canvas) return;
    canvas.width = preview.canvas.width;
    canvas.height = preview.canvas.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(preview.canvas, 0, 0);
    if (!result) return;
    const s = preview.scale / scaleRef.current;
    ctx.lineWidth = 1.5;
    for (const word of result.words) {
      if (!word.text.trim()) continue;
      const sure = word.confidence >= 70;
      ctx.fillStyle = sure ? "rgba(109, 106, 245, 0.16)" : "rgba(245, 158, 11, 0.22)";
      ctx.strokeStyle = sure ? "rgba(109, 106, 245, 0.85)" : "rgba(245, 158, 11, 0.95)";
      ctx.fillRect(word.box.x * s, word.box.y * s, word.box.w * s, word.box.h * s);
      ctx.strokeRect(word.box.x * s, word.box.y * s, word.box.w * s, word.box.h * s);
    }
  }, [preview, result]);

  const toggleLanguage = (code: string) =>
    setLanguages((current) =>
      current.includes(code)
        ? current.length > 1
          ? current.filter((c) => c !== code)
          : current
        : current.length < MAX_LANGUAGES
          ? [...current, code]
          : current,
    );

  const read = async () => {
    if (!bitmap) return;
    setBusy(true);
    setError("");
    setProgress({ fraction: 0, status: "Loading the text reader" });
    try {
      // Small text reads much better when the image is enlarged first
      const long = Math.max(bitmap.width, bitmap.height);
      const scale = long < 1600 ? Math.min(3, 2000 / long) : long > 5000 ? 5000 / long : 1;
      scaleRef.current = scale;
      const { canvas, ctx } = createCanvas(bitmap.width * scale, bitmap.height * scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const found = await recognizeText(canvas, languages, (fraction, status) => setProgress({ fraction, status }));
      setResult(found);
      setText(found.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const name = file ? baseName(file.name) : "image";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/image-to-text" />
      <DropZone maxFiles={1} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      {bitmap && (
        <div className="mt-8 w-full max-w-6xl px-4 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-3">
              <canvas ref={canvasRef} className="max-w-full max-h-[70vh] h-auto rounded-lg" />
              {result && (
                <p className="text-xs text-muted-foreground text-center">
                  Orange boxes mark words the reader was less sure about. Check those in the text.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Language of the text</span>
                <div className="flex flex-wrap gap-2">
                  {OCR_LANGUAGES.map((language) => (
                    <Button
                      key={language.code}
                      size="sm"
                      variant={languages.includes(language.code) ? "default" : "outline"}
                      onClick={() => toggleLanguage(language.code)}
                    >
                      {language.name}
                    </Button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Pick up to {MAX_LANGUAGES} if the image mixes languages.</span>
              </div>

              <Button onClick={read} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanText className="size-4" />}
                {result ? "Read again" : "Read text"}
              </Button>

              {progress && (
                <div className="flex flex-col gap-1">
                  <Progress value={Math.round(progress.fraction * 100)} />
                  <span className="text-xs text-muted-foreground">{progress.status}...</span>
                </div>
              )}

              {result && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {words ? `${words} word${words === 1 ? "" : "s"}` : "No text found"}
                      {words > 0 && ` · ${Math.round(result.confidence)}% confidence`}
                    </span>
                    <Button size="sm" variant="outline" onClick={copy} disabled={!text}>
                      <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    spellCheck
                    className="min-h-64 w-full rounded-md border bg-background p-3 text-sm leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!text}
                      onClick={() => downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${name}.txt`)}
                    >
                      <Download className="size-4" /> Text file
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!result.pdf}
                      onClick={() => result.pdf && downloadBlob(new Blob([result.pdf], { type: "application/pdf" }), `${name}-searchable.pdf`)}
                    >
                      <FileText className="size-4" /> Searchable PDF
                    </Button>
                  </div>
                </>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
