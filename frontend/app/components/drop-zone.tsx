"use client";

import { useState } from "react";
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
