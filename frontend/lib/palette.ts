// Dominant colours of an image (k-means on a sample of its pixels) and colour formatting

export type RGB = [number, number, number];

export interface Swatch {
  rgb: RGB;
  /** Share of the image, 0 to 1 */
  share: number;
}

export function extractPalette(image: ImageData, count: number): Swatch[] {
  const { data } = image;
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 20000));
  const points: RGB[] = [];
  for (let i = 0; i < total; i += step) {
    if (data[i * 4 + 3] < 128) continue; // ignore transparent pixels
    points.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }
  if (!points.length) return [];

  // k-means++ seeding: spread the starting colours apart
  const distance = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const centres: RGB[] = [points[Math.floor(points.length / 2)]];
  while (centres.length < Math.min(count, points.length)) {
    const weights = points.map((p) => Math.min(...centres.map((c) => distance(p, c))));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) break;
    let pick = Math.random() * sum;
    let index = 0;
    while (pick > weights[index]) pick -= weights[index++];
    centres.push(points[index]);
  }

  const assignment = new Int32Array(points.length);
  for (let iteration = 0; iteration < 12; iteration++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    points.forEach((p, i) => {
      let best = 0;
      let bestDistance = Infinity;
      centres.forEach((c, j) => {
        const d = distance(p, c);
        if (d < bestDistance) {
          bestDistance = d;
          best = j;
        }
      });
      assignment[i] = best;
      const s = sums[best];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    });
    centres.forEach((c, j) => {
      const s = sums[j];
      if (s[3]) centres[j] = [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])];
    });
  }
  const counts = centres.map(() => 0);
  assignment.forEach((j) => counts[j]++);
  return centres
    .map((rgb, j) => ({ rgb, share: counts[j] / points.length }))
    .filter((swatch) => swatch.share > 0)
    .sort((a, b) => b.share - a.share);
}

export const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export function toHsl([r, g, b]: RGB) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h *= 60;
  }
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/** Black or white, whichever reads better on this colour */
export const textOn = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff");
