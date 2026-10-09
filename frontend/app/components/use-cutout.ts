"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundRemovalAPI } from "@/lib/api";

const POLL_INTERVAL_MS = 2000;

/** Cuts the subject out of a photo with the background remover, for tools that finish the job in the browser */
export function useCutout() {
  const [cutout, setCutout] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ignores results from a photo the user has since replaced
  const runId = useRef(0);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setStatus("");
    setIsProcessing(false);
  };

  const poll = async (jobId: string, id: number) => {
    try {
      const job = await BackgroundRemovalAPI.getJobStatus(jobId);
      if (id !== runId.current) return;
      if (job.status === "completed") {
        const blob = await BackgroundRemovalAPI.getJobResult(jobId);
        if (id !== runId.current) return;
        setCutout(blob);
        setStatus("");
        setIsProcessing(false);
      } else if (job.status === "failed") {
        fail(job.error_message || "Processing failed");
      } else {
        setStatus(job.status === "processing" ? "Finding the subject..." : "Waiting in queue...");
        timer.current = setTimeout(() => poll(jobId, id), POLL_INTERVAL_MS);
      }
    } catch (e) {
      if (id === runId.current) fail(e);
    }
  };

  const run = async (file: File) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++runId.current;
    setCutout(null);
    setError("");
    setIsProcessing(true);
    setStatus("Uploading...");
    try {
      const job = await BackgroundRemovalAPI.submitJob(file);
      if (id !== runId.current) return;
      setStatus("Waiting in queue...");
      poll(job.job_id, id);
    } catch (e) {
      if (id === runId.current) fail(e);
    }
  };

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    runId.current++;
    setCutout(null);
    setError("");
    setStatus("");
    setIsProcessing(false);
  };

  return { run, reset, cutout, isProcessing, status, error };
}
