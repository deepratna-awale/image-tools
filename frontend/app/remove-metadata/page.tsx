"use client";

import { useState } from "react";
import { Download, MapPin, ShieldCheck } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import { IMAGE_ACCEPT } from "@/lib/formats";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { downloadBlob, downloadZip, formatBytes } from "@/lib/image-utils";
import { stripMetadata, webpExif } from "@/lib/strip-metadata";

interface Cleaned {
  name: string;
  resaved: boolean;
  blob: Blob;
  found: [string, string][];
  location: { latitude: number; longitude: number } | null;
  fieldCount: number;
  before: number;
}

// The details people most often don't realise they're sharing
const SENSITIVE: [string, string][] = [
  ["Make", "Camera make"],
  ["Model", "Camera model"],
  ["LensModel", "Lens"],
  ["BodySerialNumber", "Camera serial number"],
  ["SerialNumber", "Serial number"],
  ["DateTimeOriginal", "Taken"],
  ["Software", "Software"],
  ["Artist", "Artist"],
  ["OwnerName", "Owner"],
  ["CameraOwnerName", "Owner"],
  ["Copyright", "Copyright"],
  ["ImageDescription", "Description"],
  ["UserComment", "Comment"],
  ["parameters", "AI prompt & settings"],
  ["prompt", "AI workflow"],
];

// Basic image facts that every file has and that stay in the cleaned copy
const NOT_HIDDEN = new Set([
  "ImageWidth", "ImageHeight", "BitDepth", "ColorType", "Compression", "Filter", "Interlace", "Orientation",
  // Readable copies of the GPS tags, which are already counted
  "latitude", "longitude",
]);

function display(value: unknown) {
  if (value instanceof Date) return value.toLocaleString();
  if (value instanceof Uint8Array) return `${value.length} bytes`;
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

async function readMetadata(file: Blob) {
  const exifr = (await import("exifr")).default;
  try {
    // exifr can't open WebP files, but it can read their EXIF block
    const source = (await webpExif(file)) ?? file;
    const tags = (await exifr.parse(source, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false })) ?? {};
    return tags as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function RemoveMetadataPage() {
  const [results, setResults] = useState<Cleaned[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  const clean = async (files: File[]) => {
    setResults([]);
    setError("");
    if (files.length === 0) return;
    setIsWorking(true);
    const cleaned: Cleaned[] = [];
    for (const file of files) {
      try {
        const tags = await readMetadata(file);
        const { blob, name, resaved } = await stripMetadata(file);
        const latitude = tags.latitude as number | undefined;
        const longitude = tags.longitude as number | undefined;
        cleaned.push({
          name,
          blob,
          resaved,
          found: SENSITIVE.filter(([key]) => tags[key] !== undefined && tags[key] !== "").map(([key, label]) => [
            label,
            display(tags[key]),
          ]),
          location: typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : null,
          fieldCount: Object.keys(tags).filter((key) => !NOT_HIDDEN.has(key)).length,
          before: file.size,
        });
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setResults(cleaned);
    setIsWorking(false);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader
        href="/remove-metadata"
        description="Photos can carry the exact place they were taken, your camera or phone model and more. Remove it before you share. JPG, PNG, WebP, GIF and SVG files are cleaned without touching the picture, and nothing is uploaded: it all happens in your browser."
      />
      <DropZone maxFiles={20} maxSizeMb={50} accept={IMAGE_ACCEPT} onFilesChange={clean} />


      {isWorking && <p className="mt-6 text-sm text-muted-foreground">Cleaning...</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

      {results.length > 0 && (
        <div className="mt-8 w-full max-w-3xl px-4 flex flex-col gap-3">
          {results.map((result, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-medium truncate">{result.name}</p>
                    <p className="text-muted-foreground">
                      {result.fieldCount > 0
                        ? `Removed ${result.fieldCount} hidden detail${result.fieldCount === 1 ? "" : "s"}`
                        : "No hidden details found"}{" "}
                      · {formatBytes(result.before)} → {formatBytes(result.blob.size)}
                      {result.resaved && ` · re-saved as ${result.name.split(".").pop()?.toUpperCase()}`}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => downloadBlob(result.blob, result.name)}>
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
                {result.location && (
                  <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-destructive" />
                    <span>
                      This photo showed where it was taken:{" "}
                      <a
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${result.location.latitude}&mlon=${result.location.longitude}#map=16/${result.location.latitude}/${result.location.longitude}`}
                      >
                        {result.location.latitude.toFixed(5)}, {result.location.longitude.toFixed(5)}
                      </a>
                      . Removed.
                    </span>
                  </p>
                )}
                {result.found.length > 0 && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {result.found.map(([label, value], j) => (
                      <div key={j} className="flex justify-between gap-4 border-b border-border/50 py-1">
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className="text-right break-all line-through decoration-muted-foreground/60">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
          ))}
          {results.length > 1 && (
            <div className="flex justify-center mt-2">
              <Button className="rounded-full gap-2" onClick={() => downloadZip(results, "clean-photos.zip")}>
                <Download className="h-4 w-4" />
                Download all (ZIP)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
