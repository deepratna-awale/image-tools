"use client";

import { useEffect, useMemo, useRef } from "react";
import { ImagePlus } from "lucide-react";

interface ImagePickerProps {
  file: File | null;
  selected: boolean;
  label: string;
  onPick: (file: File) => void;
  onSelect: () => void;
}

/** A tile for choosing your own image (a background or a sky) */
export default function ImagePicker({ file, selected, label, onPick, onSelect }: ImagePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <button
      type="button"
      onClick={() => (file ? onSelect() : input.current?.click())}
      className={`relative h-20 w-32 rounded-lg overflow-hidden border-2 flex items-center justify-center text-xs text-muted-foreground bg-muted ${
        selected ? "border-primary" : "border-transparent"
      }`}
    >
      {file ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1">
          <ImagePlus className="h-5 w-5" />
          {label}
        </span>
      )}
      {file && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            input.current?.click();
          }}
          className="absolute bottom-1 right-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px]"
        >
          Change
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) {
            onPick(picked);
            onSelect();
          }
          e.target.value = "";
        }}
      />
    </button>
  );
}
