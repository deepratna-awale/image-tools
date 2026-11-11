// Copies the WebAssembly runtimes and language data that the in-browser AI tools load at run time
// (face detection and text recognition) from node_modules into public/vendor, so the site serves
// them itself instead of fetching from a CDN.
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor");
// Real paths, because pnpm keeps a package's own dependencies next to it in its store folder
const packageDir = (name, from = root) => realpathSync(join(from, "node_modules", name));

rmSync(out, { recursive: true, force: true });

// MediaPipe vision runtime
const mediapipe = join(packageDir("@mediapipe/tasks-vision"), "wasm");
mkdirSync(join(out, "mediapipe"), { recursive: true });
for (const file of readdirSync(mediapipe)) {
  // The ES module build is only used by module workers, which the site doesn't use
  if (!file.includes("_module_")) cpSync(join(mediapipe, file), join(out, "mediapipe", file));
}

// Tesseract worker, the LSTM engine core (every SIMD variant, the worker picks one) and trained data
const tesseract = join(out, "tesseract");
mkdirSync(join(tesseract, "core"), { recursive: true });
mkdirSync(join(tesseract, "lang"), { recursive: true });
cpSync(join(packageDir("tesseract.js"), "dist", "worker.min.js"), join(tesseract, "worker.min.js"));
const core = join(packageDir("tesseract.js"), "..", "tesseract.js-core");
for (const file of readdirSync(core)) {
  if (file.endsWith("-lstm.wasm.js")) cpSync(join(core, file), join(tesseract, "core", file));
}
const dataRoot = join(root, "node_modules", "@tesseract.js-data");
for (const lang of readdirSync(dataRoot)) {
  const file = join(dataRoot, lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
  if (existsSync(file)) cpSync(file, join(tesseract, "lang", `${lang}.traineddata.gz`));
}
console.log("Copied browser AI runtimes to public/vendor");
