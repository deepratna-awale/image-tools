export interface JobResponse {
  job_id: string;
  status: string;
  message: string;
  service_type: string;
}

export interface JobStatus {
  job_id: string;
  status: string;
  progress?: number;
  error_message?: string;
}

export interface BatchJobResponse {
  batch_id: string;
  status: string;
  message: string;
  service_type: string;
  total_files: number;
  job_ids: string[];
}

export interface JobResult {
  job_id: string;
  status: string;
  service_type: string;
  output_url?: string;
  error_message?: string;
  processing_time?: number;
  created_at: string;
  completed_at?: string;
}

export interface BatchJobStatus {
  batch_id: string;
  status: string;
  service_type: string;
  total_files: number;
  completed_files: number;
  failed_files: number;
  progress: number;
  results: JobResult[];
  zip_url?: string;
}

export class BackgroundRemovalAPI {
  static async submitJob(file: File): Promise<JobResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/remove-background", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to submit job");
    }

    return response.json();
  }

  static async submitBatchJob(files: File[]): Promise<BatchJobResponse> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch("/api/remove-background-batch", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to submit batch job");
    }

    return response.json();
  }

  static async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`/api/background-removal/status/${jobId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get job status");
    }

    return response.json();
  }

  static async getBatchJobStatus(batchId: string): Promise<BatchJobStatus> {
    const response = await fetch(`/api/background-removal/batch-status/${batchId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get batch job status");
    }

    return response.json();
  }

  static async getJobResult(jobId: string): Promise<Blob> {
    const response = await fetch(`/api/background-removal/result/${jobId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get job result");
    }

    return response.blob();
  }

  static async getBatchResults(batchId: string): Promise<Blob> {
    const response = await fetch(`/api/background-removal/batch-results/${batchId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get batch results");
    }

    return response.blob();
  }

  static async processDirectly(file: File): Promise<Blob> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/remove-background-direct", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to process image");
    }

    return response.blob();
  }

  static async processBatchDirectly(files: File[]): Promise<Blob> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch("/api/remove-background-batch-direct", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to process batch");
    }

    return response.blob();
  }
}
