"use client";

import { useState } from "react";
import DropZone from "../components/drop-zone";
import ImagePicker from "../components/image-picker";
import ToolResult from "../components/tool-result";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";

// Previews of the built-in skies (backend/services/sky_replacement/presets.py)
const PRESETS = [
  { id: "clear", label: "Clear", preview: "linear-gradient(#265ea8, #5896d6 55%, #bedaf0)" },
  { id: "sunset", label: "Sunset", preview: "linear-gradient(#2c346e, #c45c60 45%, #f49850 80%, #fcd084)" },
  { id: "dusk", label: "Dusk", preview: "linear-gradient(#121a40, #564680 50%, #d6808c 85%, #f6baa0)" },
  { id: "golden", label: "Golden hour", preview: "linear-gradient(#4678b4, #c4b2a0 50%, #f0c478 85%, #ffe0a0)" },
];

export default function SkySwapPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preset, setPreset] = useState("clear");
  const [customSky, setCustomSky] = useState<File | null>(null);
  const [useCustomSky, setUseCustomSky] = useState(false);
  const { run, isProcessing, status, error, resultUrl, jobId } = useToolJob("sky-replacement");

  const swapSky = () => {
    if (!photo) return;
    const formData = new FormData();
    formData.append("file", photo);
    if (useCustomSky && customSky) {
      formData.append("sky", customSky);
    } else {
      formData.append("sky_preset", preset);
    }
    run(formData);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <h1 className="text-2xl font-bold p-8">Sky Swap</h1>
      <DropZone maxFiles={1} onFilesChange={(files) => setPhoto(files[0] ?? null)} />

      <div className="mt-8 flex flex-col items-center gap-3">
        <span className="text-sm text-muted-foreground">New sky</span>
        <div className="flex flex-wrap items-start justify-center gap-3">
          {PRESETS.map(({ id, label, preview }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setPreset(id);
                setUseCustomSky(false);
              }}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={`h-20 w-32 rounded-lg border-2 ${
                  !useCustomSky && preset === id ? "border-primary" : "border-transparent"
                }`}
                style={{ background: preview }}
              />
              <span className="text-xs">{label}</span>
            </button>
          ))}
          <div className="flex flex-col items-center gap-1">
            <ImagePicker
              file={customSky}
              selected={useCustomSky}
              label="Upload a sky"
              onPick={setCustomSky}
              onSelect={() => setUseCustomSky(true)}
            />
            <span className="text-xs">Your own</span>
          </div>
        </div>
      </div>

      <Button className="mt-6" disabled={!photo || isProcessing} onClick={swapSky}>
        {isProcessing ? "Working..." : "Swap Sky"}
      </Button>
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {photo && resultUrl && (
        <ToolResult original={photo} resultUrl={resultUrl} downloadName={`sky-swapped-${jobId}.png`} />
      )}
    </div>
  );
}
