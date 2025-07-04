"use client";

import { useState } from "react";
import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Download as DownloadIcon } from "lucide-react";
import { 
  BackgroundRemovalAPI, 
  JobResponse, 
  JobStatus, 
  BatchJobResponse, 
  BatchJobStatus
} from "@/lib/api";

interface ProcessedImage {
  url: string;
  jobId: string;
  status: string;
  filename: string;
}

export default function BgRemoverPage() {
  const [files, setFiles] = useState<File[] | undefined>();
  const [status, setStatus] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [batchId, setBatchId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultImageUrl, setResultImageUrl] = useState<string>("");
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [zipDownloadUrl, setZipDownloadUrl] = useState<string>("");

  const handleRemoveBg = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select image files.");
      return;
    }

    // Reset previous results
    setProcessedImages([]);
    setResultImageUrl("");
    setZipDownloadUrl("");

    if (files.length === 1) {
      // Single file processing
      setStatus("Uploading and queuing image...");
      setIsProcessing(true);

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
    } else {
      // Batch processing
      setStatus("Uploading and queuing images for batch processing...");
      setIsProcessing(true);

      try {
        const data: BatchJobResponse = await BackgroundRemovalAPI.submitBatchJob(files);
        setBatchId(data.batch_id);
        setStatus(`Batch queued for background removal! Processing ${data.total_files} images...`);
        
        // Start polling for batch status
        pollBatchJobStatus(data.batch_id);
      } catch (error) {
        setStatus("Error: " + String(error));
        setIsProcessing(false);
      }
    }
  };

  const handleDirectProcess = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select image files.");
      return;
    }

    // Reset previous results
    setProcessedImages([]);
    setResultImageUrl("");
    setZipDownloadUrl("");

    if (files.length === 1) {
      // Single file direct processing
      setStatus("Processing image directly...");
      setIsProcessing(true);

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
    } else {
      // Batch direct processing
      setStatus("Processing images directly...");
      setIsProcessing(true);

      try {
        const zipBlob = await BackgroundRemovalAPI.processBatchDirectly(files);
        const zipUrl = URL.createObjectURL(zipBlob);
        setZipDownloadUrl(zipUrl);
        setStatus(`Batch processing completed! ${files.length} images processed.`);
        setIsProcessing(false);
      } catch (error) {
        setStatus("Error: " + String(error));
        setIsProcessing(false);
      }
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

  const pollBatchJobStatus = async (batchId: string) => {
    try {
      const statusData: BatchJobStatus = await BackgroundRemovalAPI.getBatchJobStatus(batchId);
      
      if (statusData.status === "completed") {
        console.log("Batch completed, processing results...", statusData);
        setStatus(`Batch processing completed! ${statusData.completed_files} out of ${statusData.total_files} images processed successfully.`);
        await processBatchResults(statusData);
        setIsProcessing(false);
      } else if (statusData.status === "failed") {
        setStatus("Batch job failed completely.");
        setIsProcessing(false);
      } else {
        // Still processing, continue polling
        setStatus(`Processing batch... ${statusData.completed_files + statusData.failed_files}/${statusData.total_files} completed (${statusData.progress.toFixed(1)}%)`);
        
        // Update processed images as they complete
        if (statusData.results.length > 0) {
          await processBatchResults(statusData);
        }
        
        setTimeout(() => pollBatchJobStatus(batchId), 2000); // Poll every 2 seconds
      }
    } catch (error) {
      setStatus("Error polling batch job status: " + String(error));
      setIsProcessing(false);
    }
  };

  const processBatchResults = async (statusData: BatchJobStatus) => {
    const newProcessedImages: ProcessedImage[] = [];
    
    for (const result of statusData.results) {
      if (result.status === "completed" && result.output_url) {
        try {
          const blob = await BackgroundRemovalAPI.getJobResult(result.job_id);
          const imageUrl = URL.createObjectURL(blob);
          newProcessedImages.push({
            url: imageUrl,
            jobId: result.job_id,
            status: result.status,
            filename: `processed_${result.job_id}.png`
          });
        } catch (error) {
          console.warn(`Failed to download result for job ${result.job_id}:`, error);
        }
      }
    }
    
    setProcessedImages(newProcessedImages);
    
    // Always try to get zip download when batch is completed, regardless of zip_url field
    if (statusData.status === "completed" && statusData.completed_files > 0) {
      try {
        const zipBlob = await BackgroundRemovalAPI.getBatchResults(batchId);
        const zipUrl = URL.createObjectURL(zipBlob);
        setZipDownloadUrl(zipUrl);
        console.log("Successfully set zip download URL");
      } catch (error) {
        console.warn("Failed to download batch zip:", error);
      }
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

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSingleImage = () => {
    if (resultImageUrl) {
      downloadImage(resultImageUrl, `bg-removed-${jobId || 'direct'}.png`);
    }
  };

  const downloadAllAsZip = () => {
    if (zipDownloadUrl) {
      downloadImage(zipDownloadUrl, `batch_results_${batchId || 'direct'}.zip`);
    }
  };

  const renderResults = () => {
    // Single image result
    if (resultImageUrl && processedImages.length === 0) {
      return (
        <div className="mt-6 text-center">
          <img 
            src={resultImageUrl} 
            alt="Background removed" 
            className="max-w-md max-h-96 rounded-lg shadow-lg mx-auto"
          />
          <Button onClick={downloadSingleImage} className="mt-4">
            <DownloadIcon className="mr-2 h-4 w-4" />
            Download Result
          </Button>
        </div>
      );
    }

    // Batch results grid
    if (processedImages.length > 0) {
      return (
        <div className="mt-6 w-full max-w-6xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Processed Images ({processedImages.length})</h2>
            {zipDownloadUrl && (
              <Button onClick={downloadAllAsZip} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download All (ZIP)
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {processedImages.map((image, index) => (
              <Card key={image.jobId} className="relative">
                <Button
                  onClick={() => downloadImage(image.url, image.filename)}
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 z-10 h-8 w-8 p-0 hover:bg-white/90 rounded-full shadow-sm"
                >
                  <DownloadIcon className="h-4 w-4" />
                </Button>
                <CardContent className="p-4">
                  <img
                    src={image.url}
                    alt={`Processed ${index + 1}`}
                    className="w-full h-40 object-contain rounded-lg"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Show incomplete grid if still processing */}
          {isProcessing && processedImages.length < (files?.length || 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
              {Array.from({ length: (files?.length || 0) - processedImages.length }).map((_, index) => (
                <Card key={`loading-${index}`} className="relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 z-10 h-8 w-8 p-0 bg-white/80 rounded-full shadow-sm"
                    disabled
                  >
                    <DownloadIcon className="h-4 w-4 text-gray-200" />
                  </Button>
                  <CardContent className="p-4">
                    <div className="w-full h-40 bg-gray-400 animate-pulse rounded-lg flex items-center justify-center">
                      <span className="text-gray-500">Processing...</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
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
          {isProcessing ? "Processing..." : files && files.length > 1 ? `Queue Processing (${files.length} files)` : "Queue Processing"}
        </Button>
        
        <Button 
          variant="outline"
          onClick={handleDirectProcess}
          disabled={isProcessing || !files || files.length === 0}
        >
          {isProcessing ? "Processing..." : files && files.length > 1 ? `Process Directly (${files.length} files)` : "Process Directly"}
        </Button>
      </div>
      
      {status && (
        <div className="mt-4 text-center max-w-md">
          <p className={`${status.includes("Error") || status.includes("failed") ? "text-red-500" : "text-blue-500"}`}>
            {status}
          </p>
        </div>
      )}
      
      {renderResults()}
    </div>
  );
}
