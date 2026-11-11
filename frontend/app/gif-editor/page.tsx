"use client";

import { useEffect, useMemo, useState } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Frame, decodeGif, encodeGifAnimation, framesToVideo, resizeFrame } from "@/lib/gif";
import { baseName, downloadBlob, downloadZip, formatBytes } from "@/lib/image-utils";

interface Gif {
  width: number;
  height: number;
  frames: Frame[];
}

function frameToPng(image: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

export default function GifEditorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [gif, setGif] = useState<Gif | null>(null);
  const [scale, setScale] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [reverse, setReverse] = useState(false);
  const [boomerang, setBoomerang] = useState(false);
  const [skip, setSkip] = useState(1);
  const [loop, setLoop] = useState(true);
  const [result, setResult] = useState<Blob | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const originalUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const resultUrl = useMemo(() => (result ? URL.createObjectURL(result) : ""), [result]);
  useEffect(() => () => URL.revokeObjectURL(originalUrl), [originalUrl]);
  useEffect(() => () => URL.revokeObjectURL(resultUrl), [resultUrl]);

  useEffect(() => {
    setGif(null);
    setResult(null);
    setError("");
    if (!file) return;
    setProgress("Reading frames...");
    decodeGif(file)
      .then(setGif)
      .catch(() => setError("Couldn't read this GIF"))
      .finally(() => setProgress(""));
  }, [file]);

  /** The frames after every edit, in playing order */
  const edited = (): Frame[] => {
    if (!gif) return [];
    const width = Math.max(1, Math.round((gif.width * scale) / 100));
    const height = Math.max(1, Math.round((gif.height * scale) / 100));
    let frames = gif.frames
      .map((frame, i) => ({ frame, i }))
      .filter(({ i }) => i % skip === 0)
      // Dropped frames' time goes to the frame that stays, so the length doesn't change
      .map(({ frame, i }) => {
        const time = gif.frames.slice(i, i + skip).reduce((sum, f) => sum + f.delay, 0);
        return { image: resizeFrame(frame.image, width, height), delay: Math.max(20, Math.round(time / speed)) };
      });
    if (reverse) frames = frames.reverse();
    if (boomerang) frames = [...frames, ...frames.slice(1, -1).reverse()];
    return frames;
  };

  const run = async (kind: "gif" | "frames" | "video") => {
    if (!file) return;
    setError("");
    try {
      const frames = edited();
      if (kind === "gif") {
        setResult(await encodeGifAnimation(frames, loop ? 0 : -1, (done) => setProgress(`Encoding frame ${done} of ${frames.length}`)));
      } else if (kind === "frames") {
        setProgress("Saving frames...");
        const pngs = [];
        for (let i = 0; i < frames.length; i++) pngs.push({ name: `frame-${String(i + 1).padStart(3, "0")}.png`, blob: await frameToPng(frames[i].image) });
        await downloadZip(pngs, `${baseName(file.name)}-frames.zip`);
      } else {
        setProgress("Recording video (plays through once)...");
        const video = await framesToVideo(frames);
        downloadBlob(video, `${baseName(file.name)}.${video.type.includes("mp4") ? "mp4" : "webm"}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setProgress("");
  };

  const totalMs = gif?.frames.reduce((sum, frame) => sum + frame.delay, 0) ?? 0;

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/gif-editor" />
      <DropZone maxFiles={1} maxSizeMb={50} accept={{ "image/gif": [".gif"] }} onFilesChange={(files) => setFile(files[0] ?? null)} />
      {progress && <p className="mt-3 text-sm text-muted-foreground">{progress}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {gif && file && (
        <div className="mt-8 w-full max-w-5xl px-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultUrl || originalUrl} alt="GIF" className="max-w-full max-h-[60vh] rounded" />
              <p className="text-sm text-muted-foreground">
                {resultUrl ? "Edited" : "Original"}: {gif.width} × {gif.height}, {gif.frames.length} frames, {(totalMs / 1000).toFixed(1)} s,{" "}
                {formatBytes((result ?? file).size)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex flex-col gap-4">
              <Slider label="Size" min={10} max={200} step={5} unit="%" value={scale} onChange={setScale} />
              <Slider label="Speed" min={0.25} max={4} step={0.25} unit="×" value={speed} onChange={setSpeed} />
              <Slider label="Keep frames" min={1} max={4} value={skip} unit={skip === 1 ? " (all)" : ""} onChange={setSkip} />
              <p className="-mt-2 text-xs text-muted-foreground">
                {skip > 1 ? `Keeps 1 frame in ${skip}: a smaller file, choppier motion.` : "Drop frames to make the file smaller."}
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
                Reverse
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={boomerang} onChange={(e) => setBoomerang(e.target.checked)} />
                Boomerang (forwards then backwards)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
                Loop forever
              </label>
              <Button disabled={!!progress} onClick={() => run("gif")}>
                Apply
              </Button>
              {result && <SaveButton onClick={() => downloadBlob(result, `${baseName(file.name)}-edited.gif`)} label="Download GIF" />}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="outline" disabled={!!progress} onClick={() => run("frames")}>
                  Split into frames (ZIP)
                </Button>
                <Button size="sm" variant="outline" disabled={!!progress} onClick={() => run("video")}>
                  Save as video
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
