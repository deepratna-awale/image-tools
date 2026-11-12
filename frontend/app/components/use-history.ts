"use client";

import { useCallback, useRef, useState } from "react";

const LIMIT = 100;

interface Stack<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface History<T> {
  value: T;
  /**
   * Records a change. Changes with the same `group` that follow each other closely (a slider
   * being dragged, a crop box being moved) become one undo step.
   */
  set: (next: T | ((current: T) => T), group?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Starts over from `value` with nothing to undo, e.g. when a new photo is loaded */
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** State with undo and redo */
export function useHistory<T>(initial: T | (() => T), mergeMs = 700): History<T> {
  const [stack, setStack] = useState<Stack<T>>(() => ({
    past: [],
    present: typeof initial === "function" ? (initial as () => T)() : initial,
    future: [],
  }));
  const last = useRef<{ group: string; at: number } | null>(null);

  const set = useCallback(
    (next: T | ((current: T) => T), group?: string) => {
      const now = Date.now();
      const merge = !!group && last.current?.group === group && now - last.current.at < mergeMs;
      last.current = group ? { group, at: now } : null;
      setStack((s) => {
        const value = typeof next === "function" ? (next as (current: T) => T)(s.present) : next;
        if (Object.is(value, s.present)) return s;
        if (merge) return { ...s, present: value, future: [] };
        return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] };
      });
    },
    [mergeMs],
  );

  const undo = useCallback(() => {
    last.current = null;
    setStack((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setStack((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((value: T) => {
    last.current = null;
    setStack({ past: [], present: value, future: [] });
  }, []);

  return { value: stack.present, set, undo, redo, reset, canUndo: stack.past.length > 0, canRedo: stack.future.length > 0 };
}
