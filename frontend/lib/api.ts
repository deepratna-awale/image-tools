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

  static async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`/api/background-removal/status/${jobId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get job status");
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
}
