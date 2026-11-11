"use client";

import { useEffect, useMemo, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { previewCanvas, useBitmap } from "../components/use-bitmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IMAGE_ACCEPT } from "@/lib/formats";
import { baseName, downloadBlob, formatBytes } from "@/lib/image-utils";

type Style = "logo" | "illustration" | "photo" | "bw";

const STYLES: { id: Style; label: string; colors: number; detail: number; smooth: number }[] = [
  { id: "logo", label: "Logo / icon", colors: 6, detail: 70, smooth: 0 },
  { id: "illustration", label: "Illustration", colors: 16, detail: 80, smooth: 1 },
  { id: "photo", label: "Photo (posterised)", colors: 24, detail: 60, smooth: 3 },
  { id: "bw", label: "Black & white", colors: 2, detail: 75, smooth: 0 },
];

/** Turns the picture into pure black and white at a 50% threshold, for line art and stamps */
function threshold(image: ImageData, cutoff: number) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i + 3] < 128 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < cutoff ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
}

export default function ImageToSvgPage() {
  const [file, setFile] = useState<File | null>(null);
  const { bitmap, error: loadError } = useBitmap(file);
  const [style, setStyle] = useState<Style>("logo");
  const [colors, setColors] = useState(6);
  const [detail, setDetail] = useState(70);
  const [smooth, setSmooth] = useState(0);
  const [cutoff, setCutoff] = useState(128);
  const [svg, setSvg] = useState("");
  const [svgUrl, setSvgUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  const originalUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => URL.revokeObjectURL(originalUrl), [originalUrl]);
  useEffect(() => () => URL.revokeObjectURL(svgUrl), [svgUrl]);

  const pickStyle = (id: Style) => {
    const preset = STYLES.find((s) => s.id === id)!;
    setStyle(id);
    setColors(preset.colors);
    setDetail(preset.detail);
    setSmooth(preset.smooth);
  };

  const trace = async () => {
    if (!bitmap) return;
    setIsWorking(true);
    setError("");
    // Let the button repaint before the (blocking) trace starts
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const ImageTracer = (await import("imagetracerjs")).default;
      // Tracing time grows with pixel count; 1000 px is plenty for a vector
      const { canvas, ctx } = previewCanvas(bitmap, 1000);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (style === "bw") threshold(pixels, cutoff);
      const tolerance = 0.1 + ((100 - detail) / 100) * 4;
      const result = ImageTracer.imagedataToSVG(pixels, {
        numberofcolors: style === "bw" ? 2 : colors,
        ltres: tolerance,
        qtres: tolerance,
        pathomit: Math.round(2 + ((100 - detail) / 100) * 30),
        blurradius: smooth,
        blurdelta: 20,
        colorquantcycles: 3,
        roundcoords: 1,
        viewbox: true,
        strokewidth: 0,
        scale: bitmap.width / canvas.width,
      });
      // With viewbox set the SVG has no size; give it the original's so it opens at the right size
      const sized = result.replace("<svg ", `<svg width="${bitmap.width}" height="${bitmap.height}" `);
      setSvg(sized);
      setSvgUrl(URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setIsWorking(false);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/image-to-svg" />
      <DropZone maxFiles={1} maxSizeMb={30} accept={IMAGE_ACCEPT} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      <Card className="mt-8 w-full max-w-2xl mx-4">
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {STYLES.map((option) => (
              <Button key={option.id} size="sm" variant={style === option.id ? "default" : "outline"} onClick={() => pickStyle(option.id)}>
                {option.label}
              </Button>
            ))}
          </div>
          {style === "bw" ? (
            <Slider label="Threshold" min={20} max={235} value={cutoff} onChange={setCutoff} />
          ) : (
            <Slider label="Colours" min={2} max={64} value={colors} onChange={setColors} />
          )}
          <Slider label="Detail" min={0} max={100} value={detail} onChange={setDetail} />
          <Slider label="Smoothing" min={0} max={5} value={smooth} onChange={setSmooth} />
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={!bitmap || isWorking} onClick={trace}>
        {isWorking ? "Tracing..." : "Convert to SVG"}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {svgUrl && file && (
        <div className="mt-8 w-full max-w-5xl px-4 flex flex-col items-center gap-4">
          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4 flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">Original</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={originalUrl} alt="Original" className="w-full max-h-[60vh] object-contain" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">SVG · {formatBytes(svg.length)}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgUrl} alt="SVG result" className="w-full max-h-[60vh] object-contain" />
              </CardContent>
            </Card>
          </div>
          <SaveButton onClick={() => downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${baseName(file.name)}.svg`)} label="Download SVG" />
        </div>
      )}
    </div>
  );
}
