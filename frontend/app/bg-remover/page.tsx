"use client";

import { useState } from "react";
import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";
import { BackgroundRemovalAPI, JobResponse, JobStatus } from "@/lib/api";

export default function BgRemoverPage() {
  const [files, setFiles] = useState<File[] | undefined>();
  const [status, setStatus] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultImageUrl, setResultImageUrl] = useState<string>("");

  const handleRemoveBg = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select an image file.");
      return;
    }

    setStatus("Uploading and queuing image...");
    setIsProcessing(true);
    setResultImageUrl("");

    try {
      const data: JobResponse = await BackgroundRemovalAPI.submitJob(files[0]);
      setJobId(data.job_id);
      setStatus(`Image queued for background removal! Job ID: ${data.job_id}`);
      
      // Start polling for job status
      pollJobStatus(data.job_id);
    } catch (error) {
      setStatus("Error: " + String(error));
      setIsProcessing(false);
    }
  };

  const handleDirectProcess = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select an image file.");
      return;
    }

    setStatus("Processing image directly...");
    setIsProcessing(true);
    setResultImageUrl("");

    try {
      const blob = await BackgroundRemovalAPI.processDirectly(files[0]);
      const imageUrl = URL.createObjectURL(blob);
      setResultImageUrl(imageUrl);
      setStatus("Background removal completed successfully!");
      setIsProcessing(false);
    } catch (error) {
      setStatus("Error: " + String(error));
      setIsProcessing(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const statusData: JobStatus = await BackgroundRemovalAPI.getJobStatus(jobId);
      
      if (statusData.status === "completed") {
        setStatus("Background removal completed! Downloading result...");
        await downloadResult(jobId);
        setIsProcessing(false);
      } else if (statusData.status === "failed") {
        setStatus(`Job failed: ${statusData.error_message || "Unknown error"}`);
        setIsProcessing(false);
      } else {
        // Still processing, continue polling
        setStatus(`Processing... Status: ${statusData.status}${statusData.progress ? ` (${statusData.progress}%)` : ""}`);
        setTimeout(() => pollJobStatus(jobId), 2000); // Poll every 2 seconds
      }
    } catch (error) {
      setStatus("Error polling job status: " + String(error));
      setIsProcessing(false);
    }
  };

  const downloadResult = async (jobId: string) => {
    try {
      const blob = await BackgroundRemovalAPI.getJobResult(jobId);
      const imageUrl = URL.createObjectURL(blob);
      setResultImageUrl(imageUrl);
      setStatus("Background removal completed successfully!");
    } catch (error) {
      setStatus("Error downloading result: " + String(error));
    }
  };

  const downloadImage = () => {
    if (resultImageUrl) {
      const link = document.createElement('a');
      link.href = resultImageUrl;
      link.download = `bg-removed-${jobId || 'direct'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center p-4">
      <h1 className="text-2xl font-bold p-8">Background Remover</h1>
      
      <DropZone onFilesChange={setFiles} />
      
      <div className="flex gap-4 mt-6">
        <Button 
          onClick={handleRemoveBg}
          disabled={isProcessing || !files || files.length === 0}
        >
          {isProcessing ? "Processing..." : "Queue Processing"}
        </Button>
        
        <Button 
          variant="outline"
          onClick={handleDirectProcess}
          disabled={isProcessing || !files || files.length === 0}
        >
          {isProcessing ? "Processing..." : "Process Directly"}
        </Button>
      </div>
      
      {status && (
        <div className="mt-4 text-center max-w-md">
          <p className={`${status.includes("Error") || status.includes("failed") ? "text-red-500" : "text-blue-500"}`}>
            {status}
          </p>
        </div>
      )}
      
      {resultImageUrl && (
        <div className="mt-6 text-center">
          <img 
            src={resultImageUrl} 
            alt="Background removed" 
            className="max-w-md max-h-96 rounded-lg shadow-lg"
          />
          <Button onClick={downloadImage} className="mt-4">
            Download Result
          </Button>
        </div>
      )}
    </div>
  );
}
