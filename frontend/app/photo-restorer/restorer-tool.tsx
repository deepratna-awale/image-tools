"use client";

import { useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import ToolResult from "../components/tool-result";
import Slider from "../components/slider";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";
import { IMAGE_ACCEPT, toServerFormat } from "@/lib/formats";
import { baseName } from "@/lib/image-utils";

type Colorize = "auto" | "yes" | "no";

const COLORIZE: [Colorize, string][] = [
  ["auto", "If black & white"],
  ["yes", "Always"],
  ["no", "Never"],
];

/** Photo Restorer, and Colorize, which is the same tool set to colour every photo */
export default function RestorerTool({ href, colorizeOnly = false }: { href: string; colorizeOnly?: boolean }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [convertError, setConvertError] = useState("");
  const [faces, setFaces] = useState(true);
  const [colorize, setColorize] = useState<Colorize>(colorizeOnly ? "yes" : "auto");
  const [strength, setStrength] = useState(80);
  const [submitted, setSubmitted] = useState<File | null>(null);
  const { run, isProcessing, status, error, resultUrl, jobId } = useToolJob("photo-restoration");

  const start = () => {
    if (!photo) return;
    const form = new FormData();
    form.append("file", photo);
    form.append("faces", String(faces));
    form.append("colorize", colorize);
    form.append("strength", String(strength / 100));
    setSubmitted(photo);
    run(form);
  };

  const nothing = !faces && colorize === "no";

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href={href} />
      <DropZone
        maxFiles={1}
        maxSizeMb={50}
        accept={IMAGE_ACCEPT}
        onFilesChange={async (files) => {
          setPhoto(null);
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

      <div className="mt-8 flex w-full max-w-md flex-col gap-4 px-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Colorize</span>
          <div className="flex flex-wrap gap-2">
            {COLORIZE.map(([value, label]) => (
              <Button key={value} size="sm" variant={colorize === value ? "default" : "outline"} onClick={() => setColorize(value)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={faces} onChange={(e) => setFaces(e.target.checked)} />
          <span className="font-medium">Restore faces</span>
          <span className="text-muted-foreground">sharpens blurry, faded or damaged faces</span>
        </label>
        {faces && <Slider label="Strength" min={20} max={100} value={strength} unit="%" onChange={setStrength} />}
      </div>

      <Button className="mt-6" disabled={!photo || isProcessing || nothing} onClick={start}>
        {isProcessing ? "Working..." : colorizeOnly ? "Colorize" : "Restore"}
      </Button>
      {status && isProcessing && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {photo && resultUrl && submitted === photo && (
        <ToolResult original={photo} resultUrl={resultUrl} downloadName={`${baseName(photo.name)}-restored-${jobId}.png`} />
      )}

      <p className="mt-10 max-w-xl px-4 text-center text-xs text-muted-foreground">
        Restored faces are the model&apos;s best guess at the detail that was lost, and colours are its guess at what
        they were. Lower the strength to stay closer to the original.
      </p>
    </div>
  );
}
