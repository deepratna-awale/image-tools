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


}

export type ToolService = "background-changing" | "sky-replacement" | "ai-shield" | "upscaling" | "watermark-removal" | "outpainting";

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const errorData = await response.json();
    return errorData.error || fallback;
  } catch {
    return fallback;
  }
}

/** Single-image jobs for the background changer and sky swap tools */
export class ToolAPI {
  static async submitJob(service: ToolService, formData: FormData): Promise<JobResponse> {
    const response = await fetch(`/api/tools/${service}/process`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await errorMessage(response, "Failed to submit job"));
    }

    return response.json();
  }

  static async getJobStatus(service: ToolService, jobId: string): Promise<JobStatus> {
    const response = await fetch(`/api/tools/${service}/status/${jobId}`);

    if (!response.ok) {
      throw new Error(await errorMessage(response, "Failed to get job status"));
    }

    return response.json();
  }

  static async getJobResult(service: ToolService, jobId: string): Promise<Blob> {
    const response = await fetch(`/api/tools/${service}/result/${jobId}`);

    if (!response.ok) {
      throw new Error(await errorMessage(response, "Failed to get job result"));
    }

    return response.blob();
  }
}
