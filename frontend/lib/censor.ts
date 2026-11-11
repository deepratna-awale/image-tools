// Hiding parts of an image: blur, pixelate or a solid box over each region
import { createCanvas, drawBlurred } from "./image-utils";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Draw as an oval (faces) instead of a rectangle */
  oval?: boolean;
}

export type CensorMode = "pixelate" | "blur" | "box";

/** Draws `source` with every region hidden. Strength is 1-100, relative to the image size */
export function censor(
  source: CanvasImageSource & { width: number; height: number },
  regions: Region[],
  mode: CensorMode,
  strength: number,
  boxColor = "#000000",
) {
  const { width, height } = source;
  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(source, 0, 0);
  if (!regions.length) return canvas;

  const short = Math.min(width, height);
  let hidden: HTMLCanvasElement | null = null;
  if (mode === "pixelate") {
    const block = Math.max(2, (short * strength) / 800);
    const tiny = createCanvas(width / block, height / block);
    tiny.ctx.drawImage(source, 0, 0, tiny.canvas.width, tiny.canvas.height);
    const big = createCanvas(width, height);
    big.ctx.imageSmoothingEnabled = false;
    big.ctx.drawImage(tiny.canvas, 0, 0, width, height);
    hidden = big.canvas;
  } else if (mode === "blur") {
    const blurred = createCanvas(width, height);
    drawBlurred(blurred.ctx, source, width, height, Math.max(2, (short * strength) / 600));
    hidden = blurred.canvas;
  }

  ctx.save();
  ctx.beginPath();
  for (const r of regions) {
    if (r.oval) ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.closePath();
  }
  ctx.clip();
  if (hidden) ctx.drawImage(hidden, 0, 0);
  else {
    ctx.fillStyle = boxColor;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
  return canvas;
}
