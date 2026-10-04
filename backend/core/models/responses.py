from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .job import JobResult, JobStatus, ServiceType


class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class HealthCheckResponse(BaseModel):
    status: str
    version: str
    services: Dict[str, str] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class JobSubmissionResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str
    service_type: ServiceType


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    service_type: ServiceType
    progress: Optional[float] = None
    error_message: Optional[str] = None


class BatchJobSubmissionResponse(BaseModel):
    batch_id: str
    status: JobStatus
    message: str
    service_type: ServiceType
    total_files: int
    job_ids: List[str]


class BatchJobStatusResponse(BaseModel):
    batch_id: str
    status: JobStatus
    service_type: ServiceType
    total_files: int
    completed_files: int
    failed_files: int
    progress: float
    results: List[JobResult] = Field(default_factory=list)
    zip_url: Optional[str] = None
