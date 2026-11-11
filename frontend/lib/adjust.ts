// Colour adjustments and filters done pixel by pixel, so they look the same in every browser
// (Safari ignores the canvas `filter` property).

export interface Adjustments {
  /** -100 to 100 */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Colour temperature: negative is cooler (blue), positive warmer (orange) */
  warmth: number;
  /** Tint: negative is greener, positive more magenta */
  tint: number;
  /** -180 to 180 degrees */
  hue: number;
  /** -100 (soften highlights) to 100 */
  highlights: number;
  shadows: number;
  /** 0 to 100 */
  sepia: number;
  grayscale: number;
  /** 0 to 100: unsharp mask strength */
  sharpen: number;
  /** 0 to 100: darkened corners */
  vignette: number;
  /** 0 to 100: film grain */
  grain: number;
  /** 0 to 100: lifted blacks for a faded look */
  fade: number;
  invert: boolean;
}

export const NEUTRAL: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  hue: 0,
  highlights: 0,
  shadows: 0,
  sepia: 0,
  grayscale: 0,
  sharpen: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
  invert: false,
};

export const PRESETS: { name: string; values: Partial<Adjustments> }[] = [
  { name: "Original", values: {} },
  { name: "Auto enhance", values: { contrast: 12, saturation: 15, shadows: 20, highlights: -10, sharpen: 25 } },
  { name: "Vivid", values: { contrast: 18, saturation: 40, sharpen: 15 } },
  { name: "Black & white", values: { grayscale: 100, contrast: 15 } },
  { name: "Noir", values: { grayscale: 100, contrast: 45, brightness: -8, vignette: 45, grain: 20 } },
  { name: "Sepia", values: { sepia: 85, contrast: 5 } },
  { name: "Vintage", values: { sepia: 35, fade: 30, contrast: -10, saturation: -15, vignette: 35, grain: 25, warmth: 15 } },
  { name: "Warm", values: { warmth: 35, saturation: 10 } },
  { name: "Cool", values: { warmth: -35, tint: -5 } },
  { name: "Faded", values: { fade: 45, contrast: -15, saturation: -20 } },
  { name: "Dramatic", values: { contrast: 40, saturation: -10, shadows: -15, vignette: 40, sharpen: 30 } },
  { name: "Invert", values: { invert: true } },
];

const clamp = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : value);

export function isNeutral(a: Adjustments) {
  return (Object.keys(NEUTRAL) as (keyof Adjustments)[]).every((key) => a[key] === NEUTRAL[key]);
}

/** Applies the adjustments to the pixels in place */
export function applyAdjustments(image: ImageData, a: Adjustments) {
  const { data, width, height } = image;
  if (a.sharpen > 0) sharpen(image, a.sharpen / 100);

  const brightness = (a.brightness / 100) * 255 * 0.6;
  const contrast = Math.pow((a.contrast + 100) / 100, 2);
  const saturation = 1 + a.saturation / 100;
  const warmth = (a.warmth / 100) * 40;
  const tint = (a.tint / 100) * 30;
  const sepia = a.sepia / 100;
  const gray = a.grayscale / 100;
  const fade = (a.fade / 100) * 70;
  const highlights = a.highlights / 100;
  const shadows = a.shadows / 100;

  // Hue rotation matrix (the same one CSS hue-rotate uses)
  const angle = (a.hue * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hue = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];

  const cx = width / 2;
  const cy = height / 2;
  const maxDistance = Math.sqrt(cx * cx + cy * cy);
  const vignette = a.vignette / 100;
  const grain = (a.grain / 100) * 50;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (a.hue !== 0) {
        const nr = r * hue[0] + g * hue[1] + b * hue[2];
        const ng = r * hue[3] + g * hue[4] + b * hue[5];
        const nb = r * hue[6] + g * hue[7] + b * hue[8];
        r = nr;
        g = ng;
        b = nb;
      }

      r += brightness;
      g += brightness;
      b += brightness;

      if (a.contrast !== 0) {
        r = (r - 128) * contrast + 128;
        g = (g - 128) * contrast + 128;
        b = (b - 128) * contrast + 128;
      }

      if (highlights !== 0 || shadows !== 0) {
        const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // Lift or pull the dark and bright ends separately, fading out towards the middle
        const shift = shadows * Math.pow(Math.max(0, 1 - luma * 2), 2) * 80 + highlights * Math.pow(Math.max(0, luma * 2 - 1), 2) * 80;
        r += shift;
        g += shift;
        b += shift;
      }

      if (saturation !== 1 || gray > 0) {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const s = saturation * (1 - gray);
        r = luma + (r - luma) * s;
        g = luma + (g - luma) * s;
        b = luma + (b - luma) * s;
      }

      if (sepia > 0) {
        const sr = r * 0.393 + g * 0.769 + b * 0.189;
        const sg = r * 0.349 + g * 0.686 + b * 0.168;
        const sb = r * 0.272 + g * 0.534 + b * 0.131;
        r += (sr - r) * sepia;
        g += (sg - g) * sepia;
        b += (sb - b) * sepia;
      }

      r += warmth + tint * 0.5;
      g -= tint;
      b -= warmth - tint * 0.5;

      if (fade > 0) {
        r = fade + (r * (255 - fade)) / 255;
        g = fade + (g * (255 - fade)) / 255;
        b = fade + (b * (255 - fade)) / 255;
      }

      if (vignette > 0) {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy) / maxDistance;
        const factor = 1 - vignette * Math.pow(Math.max(0, distance - 0.35) / 0.65, 2) * 0.85;
        r *= factor;
        g *= factor;
        b *= factor;
      }

      if (grain > 0) {
        const noise = (Math.random() - 0.5) * grain;
        r += noise;
        g += noise;
        b += noise;
      }

      if (a.invert) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }

      data[i] = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
    }
  }
}

/** Unsharp mask: adds back the difference between the image and a 3×3 blur of it */
function sharpen(image: ImageData, amount: number) {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data);
  const strength = amount * 1.5;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += source[i + (dy * width + dx) * 4 + c];
        }
        const blurred = sum / 9;
        data[i + c] = clamp(source[i + c] + (source[i + c] - blurred) * strength);
      }
    }
  }
}
