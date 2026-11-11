"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import SaveButton from "../components/save-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { downloadBlob, formatBytes } from "@/lib/image-utils";

type Mode = "encode" | "decode";

const ANY_IMAGE = { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp"] };

/** Reads the first bytes to name the image type, since pasted Base64 often has no "data:" prefix */
function sniffType(bytes: Uint8Array): { mime: string; ext: string } {
  const ascii = String.fromCharCode(...bytes.slice(0, 16));
  if (bytes[0] === 0x89 && ascii.slice(1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: "image/jpeg", ext: "jpg" };
  if (ascii.startsWith("GIF8")) return { mime: "image/gif", ext: "gif" };
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii.slice(4, 12) === "ftypavif") return { mime: "image/avif", ext: "avif" };
  if (ascii.startsWith("BM")) return { mime: "image/bmp", ext: "bmp" };
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return { mime: "image/x-icon", ext: "ico" };
  if (ascii.trimStart().startsWith("<")) return { mime: "image/svg+xml", ext: "svg" };
  return { mime: "application/octet-stream", ext: "bin" };
}

export default function Base64Page() {
  const [mode, setMode] = useState<Mode>("encode");
  const [file, setFile] = useState<File | null>(null);
  const [dataUri, setDataUri] = useState("");
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setDataUri("");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDataUri(String(reader.result));
    reader.readAsDataURL(file);
  }, [file]);

  const decoded = useMemo(() => {
    const text = input.trim();
    if (!text) return null;
    try {
      const base64 = text.replace(/^data:[^,]*,/, "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const { mime, ext } = sniffType(bytes);
      const blob = new Blob([bytes], { type: mime });
      return { blob, ext, url: URL.createObjectURL(blob), error: "" };
    } catch {
      return { blob: null, ext: "", url: "", error: "That isn't valid Base64." };
    }
  }, [input]);
  useEffect(() => () => {
    if (decoded?.url) URL.revokeObjectURL(decoded.url);
  }, [decoded]);

  const copy = (label: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    });

  const raw = dataUri.slice(dataUri.indexOf(",") + 1);
  const snippets: [string, string][] = dataUri
    ? [
        ["Data URI", dataUri],
        ["Base64 only", raw],
        ["HTML <img>", `<img src="${dataUri}" alt="">`],
        ["CSS background", `background-image: url("${dataUri}");`],
        ["Markdown", `![image](${dataUri})`],
      ]
    : [];

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/base64" />
      <div className="flex gap-2 mb-6">
        <Button variant={mode === "encode" ? "default" : "outline"} onClick={() => setMode("encode")}>
          Image to Base64
        </Button>
        <Button variant={mode === "decode" ? "default" : "outline"} onClick={() => setMode("decode")}>
          Base64 to image
        </Button>
      </div>

      {mode === "encode" ? (
        <>
          <DropZone maxFiles={1} maxSizeMb={10} accept={ANY_IMAGE} onFilesChange={(files) => setFile(files[0] ?? null)} />
          {dataUri && file && (
            <div className="mt-8 w-full max-w-3xl px-4 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {formatBytes(file.size)} file → {formatBytes(dataUri.length)} of text (Base64 is about a third bigger than the file).
              </p>
              {snippets.map(([label, text]) => (
                <Card key={label}>
                  <CardContent className="p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => copy(label, text)}>
                        <Copy className="size-3" /> {copied === label ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <textarea readOnly value={text} className="h-20 w-full resize-none rounded-md border bg-muted p-2 font-mono text-xs" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="w-full max-w-3xl px-4 flex flex-col gap-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste Base64 text or a data:image/... URI"
            className="h-48 w-full rounded-xl border bg-card p-3 font-mono text-xs"
          />
          {decoded?.error && <p className="text-sm text-destructive">{decoded.error}</p>}
          {decoded?.blob && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={decoded.url} alt="Decoded" className="max-h-[50vh] max-w-full rounded" />
              <p className="text-sm text-muted-foreground">
                {decoded.ext.toUpperCase()} · {formatBytes(decoded.blob.size)}
              </p>
              <SaveButton onClick={() => downloadBlob(decoded.blob!, `image.${decoded.ext}`)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
