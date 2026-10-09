"use client";

import { useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import ImagePicker from "../components/image-picker";
import ToolResult from "../components/tool-result";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";

const SWATCHES = ["#ffffff", "#000000", "#e5e7eb", "#1e90ff", "#22c55e", "#f97316", "#ec4899", "#facc15"];

export default function BgChangerPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [mode, setMode] = useState<"color" | "image">("color");
  const [color, setColor] = useState("#ffffff");
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const { run, isProcessing, status, error, resultUrl, jobId } = useToolJob("background-changing");

  const changeBackground = () => {
    if (!photo) return;
    const formData = new FormData();
    formData.append("file", photo);
    if (mode === "image" && backgroundImage) {
      formData.append("background", backgroundImage);
    } else {
      formData.append("background_color", color);
    }
    run(formData);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/bg-changer" />
      <DropZone maxFiles={1} onFilesChange={(files) => setPhoto(files[0] ?? null)} />

      <div className="mt-8 flex flex-col items-center gap-3">
        <span className="text-sm text-muted-foreground">New background</span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              onClick={() => {
                setColor(swatch);
                setMode("color");
              }}
              className={`h-10 w-10 rounded-full border-2 shadow-sm ${
                mode === "color" && color === swatch ? "border-primary scale-110" : "border-muted"
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <label
            className={`relative h-10 w-10 rounded-full border-2 overflow-hidden cursor-pointer ${
              mode === "color" && !SWATCHES.includes(color) ? "border-primary scale-110" : "border-muted"
            }`}
            style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
            title="Custom color"
          >
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setMode("color");
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          <ImagePicker
            file={backgroundImage}
            selected={mode === "image"}
            label="Use an image"
            onPick={setBackgroundImage}
            onSelect={() => setMode("image")}
          />
        </div>
      </div>

      <Button className="mt-6" disabled={!photo || isProcessing} onClick={changeBackground}>
        {isProcessing ? "Working..." : "Change Background"}
      </Button>
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {photo && resultUrl && (
        <ToolResult original={photo} resultUrl={resultUrl} downloadName={`background-changed-${jobId}.png`} />
      )}
    </div>
  );
}
