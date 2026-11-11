"use client";

import { useEffect, useRef, useState } from "react";
import { takeHandoff } from "@/lib/handoff";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/ui/shadcn-io/dropzone";

interface DropZoneProps {
  onFilesChange?: (files: File[]) => void;
  maxFiles?: number;
  /** Largest file accepted, in MB. Tools that run in the browser can take bigger files */
  maxSizeMb?: number;
  /** File types to accept; defaults to the formats the server tools read */
  accept?: Record<string, string[]>;
}

const SERVER_ACCEPT = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] };

/** Every drop zone on the page, in the order they appeared: a paste goes to the first empty one */
const zones: { isEmpty: () => boolean; add: (files: File[]) => void }[] = [];
let pasteListening = false;

function onPaste(event: ClipboardEvent) {
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, [contenteditable=true]")) return;
  const pasted = Array.from(event.clipboardData?.files ?? []);
  if (!pasted.length || !zones.length) return;
  event.preventDefault();
  // Screenshots arrive as "image.png"; give them a name that says where they came from
  const files = pasted.map((file) =>
    file.name === "image.png" ? new File([file], `pasted-${Date.now()}.png`, { type: file.type }) : file,
  );
  (zones.find((zone) => zone.isEmpty()) ?? zones[0]).add(files);
}

/** The same type check the drop zone makes, for files that arrive by paste or from another tool */
function accepts(file: File, accept: Record<string, string[]>) {
  const name = file.name.toLowerCase();
  return Object.entries(accept).some(
    ([type, extensions]) =>
      type === file.type ||
      (type.endsWith("/*") && file.type.startsWith(type.slice(0, -1))) ||
      extensions.some((extension) => name.endsWith(extension.toLowerCase())),
  );
}

const DropZone = ({ onFilesChange, maxFiles = 10, maxSizeMb = 10, accept = SERVER_ACCEPT }: DropZoneProps) => {
  const [files, setFiles] = useState<File[] | undefined>();
  const [error, setError] = useState("");

  const handleDrop = (files: File[]) => {
    setError("");
    setFiles(files);
    if (onFilesChange) {
      onFilesChange(files);
    }
  };

  /** Files pasted or handed over from another tool, checked like dropped ones */
  const addFiles = (incoming: File[]) => {
    const usable = incoming.filter((file) => accepts(file, accept));
    if (!usable.length) {
      setError("This tool can't open that kind of file");
      return;
    }
    const tooBig = usable.find((file) => file.size > 1024 * 1024 * maxSizeMb);
    if (tooBig) {
      setError(`${tooBig.name} is larger than ${maxSizeMb} MB`);
      return;
    }
    handleDrop(usable.slice(0, maxFiles));
  };
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;

  // An image sent here from another tool's result
  useEffect(() => {
    const file = takeHandoff();
    if (file) addFilesRef.current([file]);
  }, []);

  // Paste an image (a screenshot, or one copied from another app) anywhere on the page
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => {
    const zone = { isEmpty: () => !filesRef.current?.length, add: (incoming: File[]) => addFilesRef.current(incoming) };
    zones.push(zone);
    if (!pasteListening) {
      window.addEventListener("paste", onPaste);
      pasteListening = true;
    }
    return () => {
      zones.splice(zones.indexOf(zone), 1);
      if (!zones.length) {
        window.removeEventListener("paste", onPaste);
        pasteListening = false;
      }
    };
  }, []);

  return (
    <div className="flex w-full flex-col items-center justify-center px-4">
      <Dropzone
        className="min-h-56 w-full max-w-3xl whitespace-normal items-center justify-center rounded-2xl border-2 border-dashed bg-card/60 px-4 sm:px-8 backdrop-blur transition-colors hover:border-primary/50 hover:bg-card"
        maxSize={1024 * 1024 * maxSizeMb}
        minSize={1}
        maxFiles={maxFiles}
        accept={accept}
        onDrop={handleDrop}
        src={files}
        onError={(e) => setError(e.message)}
      >
        {(!files || files.length === 0) ? (
          <DropzoneEmptyState />
        ) : (
          <div className="flex flex-col w-full items-center justify-center gap-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 w-full items-center justify-center">
              {files.map((file, idx) => {
                const url = URL.createObjectURL(file);
                return (
                  <div key={idx} className="flex items-center justify-center">
                  <Thumbnail file={file} url={url} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <DropzoneContent />
      </Dropzone>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {(!files || files.length === 0) && (
        <p className="mt-2 text-xs text-muted-foreground">You can also paste an image (Ctrl+V / ⌘V).</p>
      )}
    </div>
  );
};

/** HEIC and TIFF previews don't show in most browsers, so those show the file name; the tools still open them */
function Thumbnail({ file, url }: { file: File; url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="rounded-lg bg-muted px-3 py-6 text-xs text-muted-foreground break-all">{file.name}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={file.name}
      className="max-h-[25vh] max-w-[25vw] object-contain rounded-lg shadow-md"
      onError={() => setFailed(true)}
    />
  );
}

export default DropZone;
