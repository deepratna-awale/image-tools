// Text recognition in the browser with Tesseract. The engine and language data are served by the
// site itself (public/vendor/tesseract), so images never leave the device.
import type { Worker } from "tesseract.js";

export const OCR_LANGUAGES: { code: string; name: string }[] = [
  { code: "eng", name: "English" },
  { code: "spa", name: "Spanish" },
  { code: "fra", name: "French" },
  { code: "deu", name: "German" },
  { code: "por", name: "Portuguese" },
  { code: "ita", name: "Italian" },
  { code: "rus", name: "Russian" },
  { code: "hin", name: "Hindi" },
  { code: "ara", name: "Arabic" },
  { code: "chi_sim", name: "Chinese (Simplified)" },
  { code: "jpn", name: "Japanese" },
  { code: "kor", name: "Korean" },
];

export interface OcrWord {
  text: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

export interface OcrResult {
  text: string;
  confidence: number;
  words: OcrWord[];
  /** A PDF of the image with the text laid invisibly over it, so it can be searched and copied */
  pdf: Uint8Array | null;
}

let current: { langs: string; worker: Promise<Worker> } | null = null;
let onProgress: ((progress: number, status: string) => void) | null = null;

async function getWorker(langs: string[]) {
  const key = langs.join("+");
  if (current?.langs !== key) {
    const old = current;
    const { createWorker, OEM } = await import("tesseract.js");
    current = {
      langs: key,
      worker: createWorker(langs, OEM.LSTM_ONLY, {
        workerPath: "/vendor/tesseract/worker.min.js",
        corePath: "/vendor/tesseract/core",
        langPath: "/vendor/tesseract/lang",
        gzip: true,
        logger: (m) => onProgress?.(m.progress, m.status),
      }),
    };
    current.worker.catch(() => (current = null));
    old?.worker.then((w) => w.terminate()).catch(() => {});
  }
  return current!.worker;
}

const STATUS: Record<string, string> = {
  "loading tesseract core": "Loading the text reader",
  "initializing tesseract": "Starting the text reader",
  "loading language traineddata": "Loading language data",
  "initializing api": "Starting the text reader",
  "recognizing text": "Reading text",
};

export async function recognizeText(
  image: HTMLCanvasElement,
  langs: string[],
  progress: (fraction: number, status: string) => void,
): Promise<OcrResult> {
  onProgress = (fraction, status) => progress(fraction, STATUS[status] ?? "Working");
  try {
    const worker = await getWorker(langs.length ? langs : ["eng"]);
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true, pdf: true });
    const words: OcrWord[] = [];
    for (const block of data.blocks ?? [])
      for (const paragraph of block.paragraphs)
        for (const line of paragraph.lines)
          for (const word of line.words)
            words.push({
              text: word.text,
              confidence: word.confidence,
              box: { x: word.bbox.x0, y: word.bbox.y0, w: word.bbox.x1 - word.bbox.x0, h: word.bbox.y1 - word.bbox.y0 },
            });
    return {
      text: data.text.replace(/\n{3,}/g, "\n\n").trim(),
      confidence: data.confidence,
      words,
      pdf: data.pdf ? new Uint8Array(data.pdf) : null,
    };
  } finally {
    onProgress = null;
  }
}
