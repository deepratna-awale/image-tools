"use client";

import { useEffect, useRef, useState } from "react";
import { ToolAPI, ToolService } from "@/lib/api";

const POLL_INTERVAL_MS = 2000;

/** Submits one image job to a tool, polls until it finishes and exposes the result */
export function useToolJob(service: ToolService) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [jobId, setJobId] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const poll = async (id: string) => {
    try {
      const job = await ToolAPI.getJobStatus(service, id);
      if (job.status === "completed") {
        const blob = await ToolAPI.getJobResult(service, id);
        setResultUrl(URL.createObjectURL(blob));
        setStatus("Done!");
        setIsProcessing(false);
      } else if (job.status === "failed") {
        setError(job.error_message || "Processing failed");
        setStatus("");
        setIsProcessing(false);
      } else {
        setStatus(job.status === "processing" ? "Processing..." : "Waiting in queue...");
        timer.current = setTimeout(() => poll(id), POLL_INTERVAL_MS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsProcessing(false);
    }
  };

  const run = async (formData: FormData) => {
    if (timer.current) clearTimeout(timer.current);
    setError("");
    setResultUrl("");
    setIsProcessing(true);
    setStatus("Uploading...");
    try {
      const job = await ToolAPI.submitJob(service, formData);
      setJobId(job.job_id);
      setStatus("Waiting in queue...");
      poll(job.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      setIsProcessing(false);
    }
  };

  return { run, isProcessing, status, error, resultUrl, jobId };
}
