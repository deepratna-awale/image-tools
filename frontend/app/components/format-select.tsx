"use client";

import { EXPORT_FORMATS, ExportFormat } from "@/lib/formats";

interface FormatSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  /** Formats to offer; all of them by default */
  formats?: ExportFormat[];
  /** Extra choices shown first, like "Same as original" */
  extra?: { value: T; label: string }[];
}

/** A "Save as" dropdown for the tools that export images */
export default function FormatSelect<T extends string>({ value, onChange, formats, extra = [] }: FormatSelectProps<T>) {
  const options = EXPORT_FORMATS.filter((format) => !formats || formats.includes(format.id));
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Save as</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 rounded-md border bg-background px-2"
      >
        {extra.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {options.map((format) => (
          <option key={format.id} value={format.id}>
            {format.label}
          </option>
        ))}
      </select>
    </label>
  );
}
