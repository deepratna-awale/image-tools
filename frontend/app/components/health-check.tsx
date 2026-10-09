"use client";

import { useState, useEffect } from "react";

export default function HealthCheck() {
  const [error, setError] = useState<string>("");

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch("/api/health");
      if (response.ok) {
        setError("");
      } else {
        setError("Backend not responding");
      }
    } catch (err) {
      console.error('Health check error:', err);
      setError("Failed to connect to backend");
    }
  };

  // Only speak up when the tools can't reach the backend
  if (!error) return null;

  return (
    <div className="mx-auto mt-4 flex max-w-6xl items-center justify-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      The tools are offline right now. Please try again in a moment.
      <button onClick={checkHealth} className="font-medium underline underline-offset-2 hover:no-underline">
        Retry
      </button>
    </div>
  );
}
