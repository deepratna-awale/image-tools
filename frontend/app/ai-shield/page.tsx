"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import ToolResult from "../components/tool-result";
import { useToolJob } from "../components/use-tool-job";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Matches STRENGTHS in backend/services/ai_shield/cloak.py; times measured on the server for a 768×512 image
const STRENGTHS = [
  { id: "low", label: "Low", detail: "Barely visible. About 2–3 minutes." },
  { id: "medium", label: "Medium", detail: "Faint grain in places. About 5 minutes." },
  { id: "high", label: "High", detail: "Visible texture, strongest effect. About 15 minutes." },
];

const DOES = [
  "Adds a small, carefully computed pattern that makes Stable Diffusion (1.x, 2.x and SDXL) see a \"NO AI\" texture instead of your image. Fine-tunes (LoRA, DreamBooth) and img2img edits made from it tend to come out garbled.",
  "Hides most of that pattern in busy, textured parts of the picture, so flat areas like skies and skin stay clean.",
  "Tags the file as not for AI training: IPTC Data Mining (prohibited for AI/ML training), the W3C TDM reservation used for the EU opt-out, a copyright notice, and noai / noimageai keywords.",
];

const DOES_NOT = [
  "It can't guarantee protection. Researchers have shown cloaks like this (and Glaze, Mist, Nightshade) can be weakened by upscaling, heavy compression or purposely cleaning the image.",
  "Other kinds of AI, such as Flux, Midjourney or GPT image models, may not be affected, and future models might ignore it.",
  "The do-not-train tags are a request, not a lock. They only work when whoever collects the image respects them, though they do record your wishes.",
  "Saving as JPG, resizing or editing the result weakens the cloak, and many sites strip metadata on upload. Post the PNG as it is where you can.",
];

const ROBOTS = `# Ask AI crawlers not to collect your site
User-agent: GPTBot
User-agent: ChatGPT-User
User-agent: CCBot
User-agent: Google-Extended
User-agent: anthropic-ai
User-agent: ClaudeBot
User-agent: Bytespider
User-agent: PerplexityBot
User-agent: Applebot-Extended
User-agent: meta-externalagent
Disallow: /`;

const META_TAG = `<meta name="robots" content="noai, noimageai">`;

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 pr-12 text-xs leading-relaxed">{text}</pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-1 top-1 size-8"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export default function AIShieldPage() {
  const [image, setImage] = useState<File | null>(null);
  const [cloak, setCloak] = useState(true);
  const [strength, setStrength] = useState("medium");
  const [notice, setNotice] = useState(true);
  const [creator, setCreator] = useState("");
  const [copyright, setCopyright] = useState("");
  const { run, isProcessing, status, error, resultUrl } = useToolJob("ai-shield");

  const protect = () => {
    if (!image) return;
    const formData = new FormData();
    formData.append("file", image);
    formData.append("cloak", String(cloak));
    formData.append("strength", strength);
    formData.append("metadata", String(notice));
    if (notice && creator.trim()) formData.append("creator", creator.trim());
    if (notice && copyright.trim()) formData.append("copyright_notice", copyright.trim());
    run(formData);
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <ToolHeader href="/ai-shield" />
      <DropZone maxFiles={1} onFilesChange={(files) => setImage(files[0] ?? null)} />

      <Card className="mt-8 w-full max-w-xl">
        <CardContent className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={cloak}
                onChange={(e) => setCloak(e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="font-medium">Cloak against AI mimicry</span>
                <span className="text-sm text-muted-foreground">
                  Changes pixels slightly so AI models learn or edit the wrong thing.
                </span>
              </span>
            </label>
            {cloak && (
              <div className="ml-7 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Strength">
                {STRENGTHS.map(({ id, label, detail }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={strength === id}
                    onClick={() => setStrength(id)}
                    className={`flex flex-col gap-1 rounded-lg border-2 p-2 text-left transition-colors ${
                      strength === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={notice}
                onChange={(e) => setNotice(e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="font-medium">Add a &ldquo;do not train&rdquo; notice</span>
                <span className="text-sm text-muted-foreground">
                  Writes AI opt-out and copyright details into the file.
                </span>
              </span>
            </label>
            {notice && (
              <div className="ml-7 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                  maxLength={200}
                  placeholder="Your name (optional)"
                  aria-label="Your name"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                />
                <input
                  value={copyright}
                  onChange={(e) => setCopyright(e.target.value)}
                  maxLength={200}
                  placeholder="Copyright notice (optional)"
                  aria-label="Copyright notice"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button className="mt-6" disabled={!image || isProcessing || (!cloak && !notice)} onClick={protect}>
        {isProcessing ? "Working..." : "Protect Image"}
      </Button>
      {status && isProcessing && (
        <p className="mt-3 text-sm text-muted-foreground text-center">
          {status}
          {cloak && " Cloaking runs on a small shared server, so keep this tab open."}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {image && resultUrl && (
        <ToolResult original={image} resultUrl={resultUrl} downloadName={`${baseName(image.name)}-protected.png`} />
      )}

      <div className="mt-12 w-full max-w-5xl px-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <h2 className="font-semibold">What it does</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {DOES.map((text) => (
                <li key={text} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <h2 className="font-semibold">What it can&rsquo;t promise</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {DOES_NOT.map((text) => (
                <li key={text} className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-5 flex flex-col gap-3">
            <h2 className="font-semibold">Posting on your own website?</h2>
            <p className="text-sm text-muted-foreground">
              Add these lines to your site&rsquo;s robots.txt to ask the main AI crawlers to stay away, and the tag
              to your pages&rsquo; &lt;head&gt;. Like the file notice, they only work on crawlers that follow them.
            </p>
            <CopyBlock text={ROBOTS} />
            <CopyBlock text={META_TAG} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
