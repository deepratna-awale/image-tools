"use client";

import { useEffect, useRef, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import { ExportFormat, IMAGE_ACCEPT, encodeCanvas, toServerFormat } from "@/lib/formats";
import FormatSelect from "../components/format-select";
import ToolResult from "../components/tool-result";
import { useCutout } from "../components/use-cutout";
import { Button } from "@/components/ui/button";
import { baseName, canvasToBlob, createCanvas, downloadBlob, drawBlurred, loadImage } from "@/lib/image-utils";

export default function BlurBackgroundPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [convertError, setConvertError] = useState("");
  // Blur as a share of the image's longer side, so it looks the same at any resolution
  const [strength, setStrength] = useState(12);
  const [resultUrl, setResultUrl] = useState("");
  const [saveAs, setSaveAs] = useState<ExportFormat>("jpg");
  const result = useRef<HTMLCanvasElement | null>(null);
  const { run, reset, cutout, isProcessing, status, error } = useCutout();

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  useEffect(() => {
    if (!photo || !cutout) return;
    let cancelled = false;
    // Wait for the slider to settle; blurring a large photo takes a moment
    const timer = setTimeout(async () => {
      const [original, subject] = await Promise.all([loadImage(photo), loadImage(cutout)]);
      const { width, height } = original;
      const { canvas, ctx } = createCanvas(width, height);
      drawBlurred(ctx, original, width, height, (Math.max(width, height) * strength) / 1000);
      ctx.drawImage(subject, 0, 0, width, height);
      original.close();
      subject.close();
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      if (cancelled) return;
      result.current = canvas;
      setResultUrl(URL.createObjectURL(blob));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [photo, cutout, strength]);

  const download = async () => {
    if (!result.current || !photo) return;
    const blob = await encodeCanvas(result.current, saveAs, 0.92);
    downloadBlob(blob, `${baseName(photo.name)}-blurred.${saveAs}`);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader
        href="/blur-background"
        description="Give any photo a portrait-mode look: the subject stays sharp and the background melts into a soft blur."
      />
      <DropZone
        maxFiles={1}
        maxSizeMb={50}
        accept={IMAGE_ACCEPT}
        onFilesChange={async (files) => {
          setPhoto(null);
          setResultUrl("");
          reset();
          setConvertError("");
          if (!files[0]) return;
          try {
            // HEIC, TIFF and other formats are converted here so the server can read them
            setPhoto(await toServerFormat(files[0]));
          } catch (e) {
            setConvertError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      {convertError && <p className="mt-3 text-sm text-destructive">{convertError}</p>}

      <label className="mt-8 flex w-full max-w-sm items-center gap-3 px-4 text-sm">
        <span className="text-muted-foreground">Blur</span>
        <input
          type="range"
          min={2}
          max={40}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-8 text-right">{strength}</span>
      </label>

      <Button className="mt-6" disabled={!photo || isProcessing || !!cutout} onClick={() => photo && run(photo)}>
        {isProcessing ? "Working..." : "Blur Background"}
      </Button>
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {cutout && <p className="mt-3 text-sm text-muted-foreground">Move the slider to change the blur.</p>}

      {photo && cutout && resultUrl && (
        <>
          <ToolResult original={photo} resultUrl={resultUrl} downloadName="" onDownload={download} />
          <div className="mt-3">
            <FormatSelect value={saveAs} onChange={setSaveAs} />
          </div>
        </>
      )}
    </div>
  );
}
