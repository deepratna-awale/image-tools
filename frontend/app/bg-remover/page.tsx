"use client";

import { useState, useEffect, useRef } from "react";
import DropZone from "../components/drop-zone";
import ToolHeader from "../components/tool-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Download as DownloadIcon, X } from "lucide-react";
import { 
  BackgroundRemovalAPI, 
  JobResponse, 
  JobStatus, 
  BatchJobResponse, 
  BatchJobStatus
} from "@/lib/api";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

interface ProcessedImage {
  url: string;
  jobId: string;
  status: string;
  filename: string;
}

export default function BgRemoverPage() {
  const [files, setFiles] = useState<File[] | undefined>();
  const [, setStatus] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [batchId, setBatchId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [resultImageUrl, setResultImageUrl] = useState<string>("");
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [zipDownloadUrl, setZipDownloadUrl] = useState<string>("");
  const [isCarouselOpen, setIsCarouselOpen] = useState<boolean>(false);
  const [carouselIndex, setCarouselIndex] = useState<number>(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [singleImageForCarousel, setSingleImageForCarousel] = useState<ProcessedImage | null>(null);
  const processButtonRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Cleanup function for object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (resultImageUrl && resultImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(resultImageUrl);
      }
      if (zipDownloadUrl && zipDownloadUrl.startsWith('blob:')) {
        URL.revokeObjectURL(zipDownloadUrl);
      }
      processedImages.forEach(image => {
        if (image.url && image.url.startsWith('blob:')) {
          URL.revokeObjectURL(image.url);
        }
      });
    };
  }, [resultImageUrl, zipDownloadUrl, processedImages]);

  // Keyboard event handler for carousel
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!isCarouselOpen || !carouselApi) return;
      
      if (e.key === 'Escape') {
        closeCarousel();
      } else if (e.key === 'ArrowRight') {
        carouselApi.scrollNext();
      } else if (e.key === 'ArrowLeft') {
        carouselApi.scrollPrev();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isCarouselOpen, carouselApi]);

  // Update carousel index when carousel API changes
  useEffect(() => {
    if (!carouselApi) return;

    const updateIndex = () => {
      setCarouselIndex(carouselApi.selectedScrollSnap());
    };

    carouselApi.on('select', updateIndex);
    return () => {
      carouselApi.off('select', updateIndex);
    };
  }, [carouselApi]);

  // Scroll to the selected index when carousel opens
  useEffect(() => {
    if (isCarouselOpen && carouselApi) {
      carouselApi.scrollTo(carouselIndex);
    }
  }, [isCarouselOpen, carouselApi, carouselIndex]);

  // Prevent body scroll when carousel is open
  useEffect(() => {
    if (isCarouselOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isCarouselOpen]);

  // Scroll process button into view when files are added
  useEffect(() => {
    if (files && files.length > 0 && processButtonRef.current) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        processButtonRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  }, [files]);

  // Scroll results into view when first result is available
  useEffect(() => {
    if ((resultImageUrl || processedImages.length > 0) && resultsRef.current) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 300);
    }
  }, [resultImageUrl, processedImages.length]);

  const handleRemoveBg = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select image files.");
      return;
    }

    // Reset previous results
    setProcessedImages([]);
    setResultImageUrl("");
    setZipDownloadUrl("");
    setSingleImageForCarousel(null);
    setProgress(0);

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



  const pollJobStatus = async (jobId: string) => {
    try {
      const statusData: JobStatus = await BackgroundRemovalAPI.getJobStatus(jobId);
      
      if (statusData.status === "completed") {
        setStatus("Background removal completed! Downloading result...");
        setProgress(100);
        await downloadResult(jobId);
        setIsProcessing(false);
      } else if (statusData.status === "failed") {
        setStatus(`Job failed: ${statusData.error_message || "Unknown error"}`);
        setProgress(0);
        setIsProcessing(false);
      } else {
        // Still processing, continue polling
        const progressValue = statusData.progress || 50; // Default to 50% if no progress available
        setProgress(progressValue);
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
        setProgress(100);
        setStatus(`Batch processing completed! ${statusData.completed_files} out of ${statusData.total_files} images processed successfully.`);
        await processBatchResults(statusData, batchId);
        setIsProcessing(false);
      } else if (statusData.status === "failed") {
        setStatus("Batch job failed completely.");
        setProgress(0);
        setIsProcessing(false);
      } else {
        // Still processing, continue polling
        setProgress(statusData.progress);
        setStatus(`Processing batch... ${statusData.completed_files + statusData.failed_files}/${statusData.total_files} completed (${statusData.progress.toFixed(1)}%)`);
        
        // Update processed images as they complete
        if (statusData.results.length > 0) {
          await processBatchResults(statusData, batchId);
        }
        
        setTimeout(() => pollBatchJobStatus(batchId), 2000); // Poll every 2 seconds
      }
    } catch (error) {
      setStatus("Error polling batch job status: " + String(error));
      setIsProcessing(false);
    }
  };

  const processBatchResults = async (statusData: BatchJobStatus, batchId: string) => {
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
    
    // Only try to get zip download when batch is completely finished
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
      downloadImage(resultImageUrl, `bg-removed-${jobId}.png`);
    }
  };

  const downloadAllAsZip = () => {
    if (zipDownloadUrl) {
      downloadImage(zipDownloadUrl, `batch_results_${batchId}.zip`);
    }
  };

  const openCarousel = (index: number) => {
    setCarouselIndex(index);
    setSingleImageForCarousel(null); // Clear single image when opening batch carousel
    setIsCarouselOpen(true);
  };

  const closeCarousel = () => {
    setIsCarouselOpen(false);
    setSingleImageForCarousel(null); // Clear single image when closing
  };

  const renderResults = () => {
    // Single image result
    if (resultImageUrl && processedImages.length === 0) {
      return (
        <div ref={resultsRef} className="mt-6 w-full max-w-6xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Processed Image</h2>
              <p className="text-sm text-gray-500">Click on the image to view in full size</p>
            </div>
          </div>
          
          <div className="flex justify-center">
            <Card className="relative cursor-pointer hover:shadow-lg transition-shadow w-80 md:w-96">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadSingleImage();
                }}
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2 z-10 h-8 w-8 p-0 hover:bg-white/90 rounded-full shadow-sm"
              >
                <DownloadIcon className="h-4 w-4" />
              </Button>
              <CardContent className="p-6" onClick={() => {
                // Create a single image for carousel
                const singleImage = {
                  url: resultImageUrl,
                  jobId: jobId,
                  status: 'completed',
                  filename: `bg-removed-${jobId}.png`
                };
                setSingleImageForCarousel(singleImage);
                setCarouselIndex(0);
                setIsCarouselOpen(true);
              }}>
                <img
                  src={resultImageUrl}
                  alt="Background removed"
                  className="w-full h-64 object-contain rounded-lg"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    // Batch results
    if (processedImages.length > 0 || (!isProcessing && zipDownloadUrl)) {
      return (
        <div ref={resultsRef} className="mt-6 w-full max-w-6xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">
                {processedImages.length > 0 ? `Processed Images (${processedImages.length})` : "Batch Processing Complete"}
              </h2>
              <p className="text-sm text-gray-500">
                {processedImages.length > 0 ? "Click on any image to view in carousel" : "Download your processed images below"}
              </p>
            </div>
            {!isProcessing && zipDownloadUrl && (
              <Button 
                onClick={downloadAllAsZip} 
                className="flex items-center gap-2 rounded-full"
              >
                <Download className="h-4 w-4" />
                Download All (ZIP)
              </Button>
            )}
          </div>
          
          {processedImages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {processedImages.map((image, index) => (
                <Card key={image.jobId} className="relative cursor-pointer hover:shadow-lg transition-shadow">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImage(image.url, image.filename);
                    }}
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 z-10 h-8 w-8 p-0 hover:bg-white/90 rounded-full shadow-sm"
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </Button>
                  <CardContent className="p-4" onClick={() => openCarousel(index)}>
                    <img
                      src={image.url}
                      alt={`Processed ${index + 1}`}
                      className="w-full h-40 object-contain rounded-lg"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !isProcessing && zipDownloadUrl ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">
                Batch processing completed! Use the download button above to get all results as a ZIP file.
              </p>
            </div>
          ) : null}
          
          {/* Show incomplete grid if still processing */}
          {isProcessing && processedImages.length < (files?.length || 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
              {Array.from({ length: (files?.length || 0) - processedImages.length }).map((_, index) => (
                <Card key={`loading-${index}`} className="relative">
                  <CardContent className="p-4">
                    <Skeleton className="w-full h-40 bg-zinc-600 rounded-lg" />
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

  const renderCarouselModal = () => {
    if (!isCarouselOpen) return null;
    
    // Determine which images to show in carousel
    const imagesToShow = singleImageForCarousel ? [singleImageForCarousel] : processedImages;
    if (imagesToShow.length === 0) return null;

    const currentImage = imagesToShow[carouselIndex];

    return (
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={closeCarousel}
      >
        <div 
          className="relative w-full max-w-5xl max-h-[95vh] bg-background border rounded-lg shadow-2xl mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <Button
            onClick={closeCarousel}
            size="sm"
            variant="ghost"
            className="absolute top-4 right-4 z-20 h-8 w-8 p-0 hover:bg-accent rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Carousel */}
          <div className="p-6">
            <Carousel
              setApi={setCarouselApi}
              opts={{
                align: "start",
                startIndex: carouselIndex,
                loop: true,
              }}
              className="w-full"
            >
              <CarouselContent>
                {imagesToShow.map((image, index) => (
                  <CarouselItem key={image.jobId}>
                    <div className="flex flex-col items-center">
                      <img
                        src={image.url}
                        alt={`Processed ${index + 1}`}
                        className="max-w-full max-h-[60vh] object-contain rounded-lg"
                      />
                      
                      {/* Image info and actions */}
                      <div className="mt-4 w-full flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Image {index + 1} of {imagesToShow.length}
                          </p>
                          <p className="text-xs text-muted-foreground/70">Job ID: {currentImage.jobId}</p>
                        </div>
                        <Button
                          onClick={() => downloadImage(currentImage.url, currentImage.filename)}
                          className="flex items-center gap-2 rounded-full"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              
              {imagesToShow.length > 1 && (
                <>
                  <CarouselPrevious className="left-4" />
                  <CarouselNext className="right-4" />
                </>
              )}
            </Carousel>

            {/* Thumbnail strip for navigation */}
            {imagesToShow.length > 1 && (
              <div className="border-t mt-6 pt-4">
                <div className="flex gap-2 justify-center overflow-x-auto max-w-full">
                  {imagesToShow.map((image, index) => (
                    <button
                      key={image.jobId}
                      onClick={() => {
                        setCarouselIndex(index);
                        carouselApi?.scrollTo(index);
                      }}
                      className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-all ${
                        index === carouselIndex 
                          ? 'border-primary ring-2 ring-primary/20' 
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <img
                        src={image.url}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center p-4">
      <ToolHeader href="/bg-remover" />
      
      <DropZone onFilesChange={setFiles} />
      
      <div className="flex gap-4 mt-6">
        <Button 
          ref={processButtonRef}
          onClick={handleRemoveBg}
          disabled={isProcessing || !files || files.length === 0}
          className="rounded-full"
        >
          {isProcessing ? "Processing..." : files && files.length > 1 ? `Process ${files.length} Images` : "Process Image"}
        </Button>
      </div>
      
      {isProcessing && (
        <div className="mt-4 text-center max-w-md w-full">
          <div className="mb-3">
            <Progress value={progress} className="w-full" />
          </div>
        </div>
      )}
      
      {renderResults()}
      {renderCarouselModal()}
    </div>
  );
}
