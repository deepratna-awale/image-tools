"use client";

import { useEffect, useState } from "react";
import { loadImage } from "@/lib/image-utils";

/** Decodes a file (any supported format) into an ImageBitmap, closing the old one when the file changes */
export function useBitmap(file: File | null | undefined) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let current: ImageBitmap | null = null;
    setBitmap(null);
    setError("");
    if (!file) return;
    loadImage(file)
      .then((image) => {
        if (cancelled) image.close();
        else {
          current = image;
          setBitmap(image);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      current?.close();
    };
  }, [file]);

  return { bitmap, error };
}

/** Draws a source scaled down to fit within maxSide, for live previews */
export function previewCanvas(source: CanvasImageSource & { width: number; height: number }, maxSide = 1000) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, scale };
}
