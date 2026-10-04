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
}

const DropZone = ({ onFilesChange, maxFiles = 10 }: DropZoneProps) => {
  const [files, setFiles] = useState<File[] | undefined>();

  const handleDrop = (files: File[]) => {
    console.log(files);
    setFiles(files);
    if (onFilesChange) {
      onFilesChange(files);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-16">
      <Dropzone
        className="flex h-full w-full items-center justify-center px-8"
        maxSize={1024 * 1024 * 10}
        minSize={1024}
        maxFiles={maxFiles}
        accept={{ "image/jpg": [],
          "image/jpeg": [],
          "image/png": [],
          "image/webp": [],
          "image/svg": []
         }}
        onDrop={handleDrop}
        src={files}
        onError={console.error}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={file.name}
                    className="max-h-[25vh] max-w-[25vw] object-contain rounded-lg shadow-md"
                  />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <DropzoneContent />
      </Dropzone>
    </div>
  );
};

export default DropZone;
