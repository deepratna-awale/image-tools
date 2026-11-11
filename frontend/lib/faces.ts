// Face detection in the browser with MediaPipe's BlazeFace model. The runtime and model are
// served by the site itself (public/vendor/mediapipe and public/models), so photos never leave the device.
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { createCanvas } from "./image-utils";
import type { Region } from "./censor";

let detector: Promise<FaceDetector> | null = null;
const INPUT = 640;

function getDetector() {
  detector ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks("/vendor/mediapipe");
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.55,
    });
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

interface Found extends Region {
  score: number;
}

const area = (r: Region) => r.w * r.h;
function overlap(a: Region, b: Region) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / Math.min(area(a), area(b)) : 0;
}

/**
 * Finds every face in the image. The model is made for faces that fill a good part of the frame,
 * so it also looks at overlapping tiles at a few zoom levels to catch small faces in group photos.
 * Returns oval regions, a little larger than the face so hair and chin are covered too.
 */
export async function detectFaces(source: CanvasImageSource & { width: number; height: number }): Promise<Region[]> {
  const model = await getDetector();
  const { width, height } = source;
  const long = Math.max(width, height);
  const found: Found[] = [];
  const input = createCanvas(INPUT, INPUT);

  // The model finds faces that fill a good part of its input, so each level halves (roughly)
  // the tile size, down to tiles where a face would be a few dozen pixels across
  const smallest = Math.max(200, long / 16);
  for (let size = long, level = 0; level === 0 || size >= smallest; size /= 1.6, level++) {
    const step = size * 0.75;
    for (let top = 0; top < height; top += step) {
      for (let left = 0; left < width; left += step) {
        const w = Math.min(size, width - left);
        const h = Math.min(size, height - top);
        if (w < size * 0.3 || h < size * 0.3) continue;
        // Every tile goes into the same square canvas: MediaPipe misses faces when the
        // input size keeps changing between calls
        const scale = INPUT / Math.max(w, h);
        input.ctx.fillStyle = "#808080";
        input.ctx.fillRect(0, 0, INPUT, INPUT);
        input.ctx.drawImage(source, left, top, w, h, 0, 0, w * scale, h * scale);
        for (const detection of model.detect(input.canvas).detections) {
          const box = detection.boundingBox;
          const score = detection.categories[0]?.score ?? 0;
          if (!box) continue;
          if (level > 0) {
            // Tiles see many more patches of texture, so they need a surer answer, and a face
            // cut by the tile's edge is left to a neighbouring tile that holds all of it
            const margin = INPUT * 0.01;
            const cut =
              (box.originX < margin && left > 0) ||
              (box.originY < margin && top > 0) ||
              (box.originX + box.width > w * scale - margin && left + w < width) ||
              (box.originY + box.height > h * scale - margin && top + h < height);
            if (score < 0.8 || cut) continue;
          }
          found.push({
            x: left + box.originX / scale,
            y: top + box.originY / scale,
            w: box.width / scale,
            h: box.height / scale,
            score,
          });
        }
        if (left + w >= width) break;
      }
      if (top + size >= height) break;
    }
  }

  // Keep the most confident box where several tiles found the same face
  found.sort((a, b) => b.score - a.score);
  const kept: Found[] = [];
  for (const face of found) if (!kept.some((k) => overlap(k, face) > 0.4)) kept.push(face);

  return kept.map(({ x, y, w, h }) => {
    const grow = 0.25;
    const nx = Math.max(0, x - w * grow);
    const ny = Math.max(0, y - h * grow * 1.8);
    return {
      x: nx,
      y: ny,
      w: Math.min(width, x + w * (1 + grow)) - nx,
      h: Math.min(height, y + h * (1 + grow)) - ny,
      oval: true,
    };
  });
}
