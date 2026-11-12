"use client";

import { useEffect } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UndoRedoProps {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  className?: string;
}

/** Typing in a text box keeps the browser's own undo for that box */
function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !["range", "checkbox", "radio", "color", "button", "file"].includes(target.type);
}

/** Undo and redo buttons, also on Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl+Y */
export default function UndoRedo({ canUndo, canRedo, undo, redo, className = "" }: UndoRedoProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || (key === "y" && !e.metaKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className={`flex gap-1 ${className}`}>
      <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
        <Undo2 className="size-4" />
        Undo
      </Button>
      <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <Redo2 className="size-4" />
        Redo
      </Button>
    </div>
  );
}
