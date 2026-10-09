"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ModelInfo {
  name: string | null;
  hash: string | null;
}

interface SamplerInfo {
  name: string;
  parameters: Record<string, unknown>;
  model: ModelInfo | null;
}

interface MetadataResult {
  found: boolean;
  image: { format: string; width: number; height: number };
  generator?: string;
  prompt?: string;
  negative_prompt?: string;
  models?: ModelInfo[];
  samplers?: SamplerInfo[];
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

const LABELS: Record<string, string> = {
  cfg_scale: "CFG scale",
  seed: "Seed",
  steps: "Steps",
  scheduler: "Scheduler",
  denoise: "Denoise",
  strength: "Strength",
  noise: "Noise",
};

function label(key: string) {
  return LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function display(value: unknown) {
  if (value === null || value === undefined) return "";
  // ComfyUI floats like 0.5199999999999996
  if (typeof value === "number" && !Number.isInteger(value)) return String(Number(value.toFixed(4)));
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isScalar(value: unknown) {
  return value === null || typeof value !== "object";
}

function modelName(model: ModelInfo) {
  return model.name ? (model.hash ? `${model.name} (${model.hash})` : model.name) : model.hash ?? "";
}

function CopyButton({ text, title = "Copy" }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="ghost" size="sm" className="gap-1" onClick={copy} aria-label={title}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : title}
    </Button>
  );
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        {text && <CopyButton text={text} />}
      </div>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
        {text || <span className="text-muted-foreground">None</span>}
      </p>
    </div>
  );
}

function SettingsGrid({ rows }: { rows: [string, unknown][] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4 border-b border-border/50 py-1">
          <dt className="text-muted-foreground shrink-0">{label(key)}</dt>
          <dd className="text-right break-all">{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function PromptReaderPage() {
  const [result, setResult] = useState<MetadataResult | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readImage = async (file: File | undefined) => {
    setResult(null);
    setError(null);
    if (!file) return;

    setIsReading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/tools/metadata-reading/read", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read this image");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this image");
    } finally {
      setIsReading(false);
    }
  };

  const samplers = result?.samplers ?? [];
  // ComfyUI node settings are objects; they stay in the raw metadata and the JSON copy
  const extras = Object.entries(result?.metadata ?? {}).filter(([, value]) => isScalar(value));
  const rawParameters = result?.raw ? JSON.stringify(result.raw, null, 2) : "";

  return (
    <div className="flex flex-col h-full w-full items-center justify-center pb-16">
      <h1 className="text-2xl font-bold p-8">Prompt Reader</h1>
      <p className="-mt-6 mb-6 max-w-xl px-4 text-center text-sm text-muted-foreground">
        See the prompt, seed, model and settings saved in images made with AUTOMATIC1111, Forge, ComfyUI, Fooocus,
        InvokeAI or NovelAI.
      </p>
      <DropZone maxFiles={1} onFilesChange={(files) => readImage(files[0])} />

      {isReading && <p className="mt-6 text-sm text-muted-foreground">Reading metadata...</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

      {result && !result.found && (
        <p className="mt-6 max-w-xl px-4 text-center text-sm text-muted-foreground">
          No generation data found in this {result.image.format} ({result.image.width}×{result.image.height}). Sites
          and chat apps often strip it, so try the original file from your generator.
        </p>
      )}

      {result?.found && (
        <div className="mt-8 w-full max-w-4xl px-4 flex flex-col gap-4">
          <Card>
            <CardContent className="p-6 flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    {result.generator}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {result.image.format} · {result.image.width}×{result.image.height}
                  </span>
                </div>
                <CopyButton text={JSON.stringify(result, null, 2)} title="Copy JSON" />
              </div>

              <PromptBlock title="Prompt" text={result.prompt ?? ""} />
              <PromptBlock title="Negative prompt" text={result.negative_prompt ?? ""} />

              {(result.models ?? []).length > 0 && (
                <SettingsGrid
                  rows={(result.models ?? []).map((model, i) => [
                    result.models!.length > 1 ? `Model ${i + 1}` : "Model",
                    modelName(model),
                  ])}
                />
              )}
            </CardContent>
          </Card>

          {samplers.map((sampler, i) => (
            <Card key={i}>
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="text-sm font-medium">
                  {samplers.length > 1 ? `Pass ${i + 1}: ` : "Sampler: "}
                  {sampler.name}
                  {samplers.length > 1 && sampler.model && (
                    <span className="text-muted-foreground"> · {modelName(sampler.model)}</span>
                  )}
                </span>
                <SettingsGrid rows={Object.entries(sampler.parameters)} />
              </CardContent>
            </Card>
          ))}

          {extras.length > 0 && (
            <Card>
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="text-sm font-medium">Other settings</span>
                <SettingsGrid rows={extras} />
              </CardContent>
            </Card>
          )}

          {rawParameters && (
            <Card>
              <CardContent className="p-6">
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Raw metadata</summary>
                  <div className="mt-3 flex justify-end">
                    <CopyButton text={rawParameters} />
                  </div>
                  <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                    {rawParameters}
                  </pre>
                </details>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
