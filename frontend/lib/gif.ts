// Animated GIF reading and writing for the GIF tools

export interface Frame {
  image: ImageData;
  /** Milliseconds this frame stays on screen */
  delay: number;
}

/** Decodes every frame of a GIF into full-size pictures, honouring each frame's disposal method */
export async function decodeGif(file: Blob): Promise<{ width: number; height: number; frames: Frame[] }> {
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const gif = parseGIF(await file.arrayBuffer());
  const raw = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const patch = document.createElement("canvas");
  const patchCtx = patch.getContext("2d")!;
  const frames: Frame[] = [];
  for (const frame of raw) {
    const { left, top, width: w, height: h } = frame.dims;
    const before = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
    patch.width = w;
    patch.height = h;
    patchCtx.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), w, h), 0, 0);
    ctx.drawImage(patch, left, top);
    frames.push({ image: ctx.getImageData(0, 0, width, height), delay: Math.max(20, frame.delay || 100) });
    if (frame.disposalType === 2) ctx.clearRect(left, top, w, h);
    else if (before) ctx.putImageData(before, 0, 0);
  }
  return { width, height, frames };
}

/** Encodes frames (all the same size) as a looping GIF. loop: 0 = forever, n = play n+1 times, -1 = once */
export async function encodeGifAnimation(frames: Frame[], loop = 0, onProgress?: (done: number) => void): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const { image, delay } = frames[i];
    const hasAlpha = image.data.some((value, j) => j % 4 === 3 && value < 128);
    const format = hasAlpha ? "rgba4444" : "rgb565";
    const palette = quantize(image.data, 256, { format, oneBitAlpha: hasAlpha });
    const index = applyPalette(image.data, palette, format);
    const transparentIndex = hasAlpha ? palette.findIndex((color) => color[3] === 0) : -1;
    gif.writeFrame(index, image.width, image.height, {
      palette,
      delay,
      repeat: i === 0 ? loop : undefined,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
    onProgress?.(i + 1);
    // Keep the page responsive on long animations
    if (i % 5 === 4) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

/** Scales a frame to the given size */
export function resizeFrame(image: ImageData, width: number, height: number): ImageData {
  if (image.width === width && image.height === height) return image;
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  source.getContext("2d")!.putImageData(image, 0, 0);
  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const ctx = target.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Records the frames as a video with MediaRecorder: WebM in Chrome and Firefox, MP4 in Safari */
export async function framesToVideo(frames: Frame[]): Promise<Blob> {
  const { width, height } = frames[0].image;
  const canvas = document.createElement("canvas");
  // Video encoders want even dimensions
  canvas.width = width + (width % 2);
  canvas.height = height + (height % 2);
  const ctx = canvas.getContext("2d")!;
  const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("This browser can't record video");
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  const draw = (image: ImageData) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tmp = document.createElement("canvas");
    tmp.width = image.width;
    tmp.height = image.height;
    tmp.getContext("2d")!.putImageData(image, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  };
  draw(frames[0].image);
  recorder.start();
  for (const frame of frames) {
    draw(frame.image);
    await new Promise((resolve) => setTimeout(resolve, frame.delay));
  }
  recorder.stop();
  await done;
  return new Blob(chunks, { type: type.split(";")[0] });
}
