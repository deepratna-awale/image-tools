"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import ToolHeader from "../components/tool-header";
import Slider from "../components/slider";
import SaveButton from "../components/save-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Frame, encodeGifAnimation } from "@/lib/gif";
import { IMAGE_ACCEPT } from "@/lib/formats";
import { createCanvas, downloadBlob, formatBytes, loadImage } from "@/lib/image-utils";

type Mode = "images" | "video";

const IMAGE_EXTENSIONS = Object.values(IMAGE_ACCEPT).flat().join(",");

/** Draws a source centred inside a width × height frame on the background colour */
function fitFrame(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, background: string | null) {
  const { ctx } = createCanvas(width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
  return ctx.getImageData(0, 0, width, height);
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}

export default function GifMakerPage() {
  const [mode, setMode] = useState<Mode>("images");
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(5);
  const [fps, setFps] = useState(10);
  const [delay, setDelay] = useState(500);
  const [width, setWidth] = useState(480);
  const [loop, setLoop] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoUrl = useMemo(() => (video ? URL.createObjectURL(video) : ""), [video]);
  const thumbs = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  const resultUrl = useMemo(() => (result ? URL.createObjectURL(result) : ""), [result]);
  useEffect(() => () => URL.revokeObjectURL(videoUrl), [videoUrl]);
  useEffect(() => () => thumbs.forEach((url) => URL.revokeObjectURL(url)), [thumbs]);
  useEffect(() => () => URL.revokeObjectURL(resultUrl), [resultUrl]);

  const move = (i: number, by: number) => {
    const next = [...images];
    const [item] = next.splice(i, 1);
    next.splice(Math.min(Math.max(0, i + by), next.length), 0, item);
    setImages(next);
  };

  const fromImages = async (): Promise<Frame[]> => {
    const bitmaps = [];
    for (const file of images) bitmaps.push(await loadImage(file));
    // Every frame takes the first image's shape
    const height = Math.round((width * bitmaps[0].height) / bitmaps[0].width);
    const frames = bitmaps.map((bitmap) => ({ image: fitFrame(bitmap, bitmap.width, bitmap.height, width, height, transparent ? null : background), delay }));
    bitmaps.forEach((bitmap) => bitmap.close());
    return frames;
  };

  const fromVideo = async (): Promise<Frame[]> => {
    const element = videoRef.current!;
    const height = Math.round((width * element.videoHeight) / element.videoWidth);
    const frames: Frame[] = [];
    const step = 1 / fps;
    const last = Math.min(end, duration);
    for (let t = start; t < last && frames.length < 600; t += step) {
      await seek(element, t);
      frames.push({ image: fitFrame(element, element.videoWidth, element.videoHeight, width, height, "#000000"), delay: Math.round(1000 / fps) });
      setProgress(`Reading video: ${Math.round(((t - start) / (last - start)) * 100)}%`);
    }
    return frames;
  };

  const make = async () => {
    setError("");
    setResult(null);
    try {
      setProgress("Preparing frames...");
      const frames = mode === "images" ? await fromImages() : await fromVideo();
      if (!frames.length) throw new Error("No frames to animate");
      const blob = await encodeGifAnimation(frames, loop ? 0 : -1, (done) => setProgress(`Encoding frame ${done} of ${frames.length}`));
      setResult(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setProgress("");
  };

  const ready = mode === "images" ? images.length > 0 : !!video && duration > 0;
  const estimatedFrames = mode === "video" ? Math.ceil((Math.min(end, duration) - start) * fps) : images.length;

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/gif-maker" />
      <div className="flex gap-2 mb-6">
        <Button variant={mode === "images" ? "default" : "outline"} onClick={() => setMode("images")}>
          From images
        </Button>
        <Button variant={mode === "video" ? "default" : "outline"} onClick={() => setMode("video")}>
          From a video
        </Button>
      </div>

      <Card className="w-full max-w-3xl mx-4">
        <CardContent className="p-6 flex flex-col gap-5">
          {mode === "images" ? (
            <>
              <input
                type="file"
                multiple
                accept={`image/*,${IMAGE_EXTENSIONS}`}
                onChange={(e) => setImages([...images, ...Array.from(e.target.files ?? [])])}
                className="text-sm"
              />
              {images.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {images.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="relative flex flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbs[i]} alt={file.name} className="h-20 w-20 rounded-md object-cover bg-muted" />
                      <div className="flex gap-1">
                        <button className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, -1)} aria-label="Earlier">
                          <ArrowUp className="size-3 -rotate-90" />
                        </button>
                        <span className="text-xs">{i + 1}</span>
                        <button className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, 1)} aria-label="Later">
                          <ArrowDown className="size-3 -rotate-90" />
                        </button>
                      </div>
                      <button
                        className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                        onClick={() => setImages(images.filter((_, j) => j !== i))}
                        aria-label="Remove"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Slider label="Frame time" min={20} max={3000} step={10} unit=" ms" value={delay} onChange={setDelay} />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
                  Keep transparency
                </label>
                {!transparent && (
                  <label className="flex items-center gap-2">
                    Background <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
                  </label>
                )}
              </div>
            </>
          ) : (
            <>
              <input
                type="file"
                accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
                onChange={(e) => {
                  setVideo(e.target.files?.[0] ?? null);
                  setDuration(0);
                }}
                className="text-sm"
              />
              {videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  muted
                  playsInline
                  className="max-h-72 rounded-lg bg-black"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    setDuration(d);
                    setStart(0);
                    setEnd(Math.min(d, 5));
                  }}
                />
              )}
              {duration > 0 && (
                <>
                  <Slider label="Start" min={0} max={Math.floor(duration * 10) / 10} step={0.1} unit=" s" value={start} onChange={(v) => setStart(Math.min(v, end - 0.1))} />
                  <Slider label="End" min={0} max={Math.floor(duration * 10) / 10} step={0.1} unit=" s" value={end} onChange={(v) => setEnd(Math.max(v, start + 0.1))} />
                  <Slider label="Frames/sec" min={2} max={30} value={fps} onChange={setFps} />
                  <p className="text-xs text-muted-foreground">
                    {estimatedFrames} frames{estimatedFrames > 600 ? " (only the first 600 are used; shorten the clip)" : ""}. Longer clips and more frames make bigger GIFs.
                  </p>
                </>
              )}
            </>
          )}
          <Slider label="Width" min={120} max={1200} step={10} unit=" px" value={width} onChange={setWidth} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop forever
          </label>
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={!ready || !!progress} onClick={make}>
        {progress ? "Working..." : "Make GIF"}
      </Button>
      {progress && <p className="mt-3 text-sm text-muted-foreground">{progress}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-8 flex flex-col items-center gap-4 px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Your GIF" className="max-w-full max-h-[60vh] rounded-lg shadow" />
          <p className="text-sm text-muted-foreground">{formatBytes(result.size)}</p>
          <SaveButton onClick={() => downloadBlob(result, "animation.gif")} label="Download GIF" />
        </div>
      )}
    </div>
  );
}
