"use client";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

/** A labelled range input with its value shown on the right */
export default function Slider({ label, value, min, max, step = 1, unit = "", onChange }: SliderProps) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(min < 0 ? 0 : min)}
        className="flex-1 min-w-0"
      />
      <span className="w-14 text-right tabular-nums">
        {value}
        {unit}
      </span>
    </label>
  );
}
