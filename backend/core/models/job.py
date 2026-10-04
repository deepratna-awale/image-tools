import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ServiceType(str, Enum):
    BACKGROUND_REMOVAL = "background_removal"
    BACKGROUND_CHANGING = "background_changing"
    SKY_REPLACEMENT = "sky_replacement"
    OUTPAINTING = "outpainting"


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


def _new_id() -> str:
    return str(uuid.uuid4())


class Job(BaseModel):
    """A unit of work sent through the queue to a worker"""

    job_id: str = Field(default_factory=_new_id)
    service_type: ServiceType
    input_file_path: Optional[str] = None
    status: JobStatus = JobStatus.QUEUED
    parameters: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def batch_id(self) -> Optional[str]:
        return self.parameters.get("batch_id")

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(mode="json")

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Job":
        return cls.model_validate(data)


class JobResult(BaseModel):
    """Tracked state of a single job"""

    job_id: str
    status: JobStatus
    service_type: ServiceType
    output_url: Optional[str] = None
    error_message: Optional[str] = None
    processing_time: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class BatchJob(BaseModel):
    """A group of jobs submitted together"""

    batch_id: str = Field(default_factory=_new_id)
    service_type: ServiceType
    total_files: int
    status: JobStatus = JobStatus.QUEUED
    jobs: List[Job] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BatchJobResult(BaseModel):
    """Tracked state of a batch of jobs"""

    batch_id: str
    status: JobStatus
    service_type: ServiceType
    total_files: int
    completed_files: int = 0
    failed_files: int = 0
    progress: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    results: List[JobResult] = Field(default_factory=list)
    zip_url: Optional[str] = None
