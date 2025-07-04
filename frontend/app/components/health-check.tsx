"use client";

import { useState, useEffect } from "react";

interface HealthStatus {
  status: string;
  version: string;
  services: Record<string, string>;
}

export default function HealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch("/api/health");
      if (response.ok) {
        const data = await response.json();
        setHealth(data);
        setError("");
      } else {
        setError("Backend not responding");
      }
    } catch (err) {
      setError("Failed to connect to backend");
    }
  };

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <strong>Backend Status:</strong> {error}
        <button 
          onClick={checkHealth}
          className="ml-2 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
        <strong>Backend Status:</strong> Checking...
      </div>
    );
  }

  return (
    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
      <strong>Backend Status:</strong> {health.status} (v{health.version})
    </div>
  );
}
