import asyncio
import logging
import os
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from core.models.job import Job, ServiceType, JobStatus, JobResult
from core.messaging.queue_manager import QueueManager
from core.messaging.rabbitmq_adapter import RabbitMQAdapter
from core.messaging.sqs_adapter import SQSAdapter
from core.storage.storage_manager import StorageManager
from core.storage.local_storage import LocalStorage
from core.storage.s3_storage import S3Storage
from config.settings import settings
from .processor import BackgroundRemovalProcessor

logger = logging.getLogger(__name__)


class BackgroundRemovalService:
    """Service layer for background removal operations"""
    
    def __init__(self):
        # Initialize queue manager based on configuration
        if settings.queue_type == "sqs":
            self.queue_manager: QueueManager = SQSAdapter()
        else:
            self.queue_manager: QueueManager = RabbitMQAdapter()
        
        # Initialize storage manager based on configuration
        if settings.storage_type == "s3":
            self.storage_manager: StorageManager = S3Storage()
        else:
            self.storage_manager: StorageManager = LocalStorage()
        
        # Initialize processor
        self.processor = BackgroundRemovalProcessor()
        
        # In-memory job tracking (use Redis in production)
        self.jobs: Dict[str, JobResult] = {}
        
        # Initialize connections
        self._initialized = False
    
    async def _ensure_initialized(self):
        """Ensure service is properly initialized"""
        if not self._initialized:
            await self.queue_manager.connect()
            self._initialized = True
    
    async def submit_job(self, file_content: bytes, filename: str = None) -> Job:
        """Submit a background removal job"""
        await self._ensure_initialized()
        
        try:
            # Upload file to storage
            file_path = await self.storage_manager.upload_file(
                file_content, 
                filename or "image.jpg",
                "image/jpeg"
            )
            
            # Create job
            job = Job(
                service_type=ServiceType.BACKGROUND_REMOVAL,
                input_file_path=file_path,
                status=JobStatus.QUEUED
            )
            
            # Store job info
            self.jobs[job.job_id] = JobResult(
                job_id=job.job_id,
                status=job.status,
                service_type=job.service_type,
                created_at=job.created_at
            )
            
            # Send to queue
            await self.queue_manager.send_job(job)
            
            logger.info(f"Background removal job {job.job_id} submitted")
            return job
            
        except Exception as e:
            logger.error(f"Error submitting background removal job: {e}")
            raise
    
    async def get_job_status(self, job_id: str) -> Optional[JobResult]:
        """Get job status"""
        job_result = self.jobs.get(job_id)
        if not job_result:
            return None
        
        # If job is still queued, check if result file exists (worker may have completed it)
        if job_result.status == JobStatus.QUEUED:
            # Try multiple possible result file paths
            possible_paths = [
                f"results/result_{job_id}.png",  # Original relative path
                os.path.join(settings.local_storage_path, "results", f"result_{job_id}.png"),  # Full path in results
                os.path.join(settings.local_storage_path, "uploads", f"result_{job_id}.png"),  # Full path in uploads
            ]
            
            result_path = None
            for path in possible_paths:
                if await self.storage_manager.file_exists(path):
                    result_path = path
                    break
            
            if result_path:
                # Update job status to completed
                job_result.status = JobStatus.COMPLETED
                job_result.output_url = result_path
                job_result.completed_at = datetime.utcnow()
                logger.info(f"Job {job_id} status updated to completed (result file found at: {result_path})")
        
        return job_result
    
    async def get_job_result(self, job_id: str) -> Optional[bytes]:
        """Get job result data"""
        job_result = self.jobs.get(job_id)
        if not job_result:
            return None
        
        # Check if result file exists even if status is not completed
        # Try multiple possible result file paths
        possible_paths = [
            f"results/result_{job_id}.png",  # Standard results path
            os.path.join(settings.local_storage_path, "results", f"result_{job_id}.png"),  # Full path in results
            os.path.join(settings.local_storage_path, "uploads", f"result_{job_id}.png"),  # Full path in uploads (legacy)
        ]
        
        result_path = None
        for path in possible_paths:
            if await self.storage_manager.file_exists(path):
                result_path = path
                break
        
        if result_path:
            # Update job status if it was still queued
            if job_result.status == JobStatus.QUEUED:
                job_result.status = JobStatus.COMPLETED
                job_result.output_url = result_path
                job_result.completed_at = datetime.utcnow()
                logger.info(f"Job {job_id} status updated to completed (result file found)")
            
            return await self.storage_manager.download_file(result_path)
        
        # Original logic for when job is completed and has output_url
        if job_result.status == JobStatus.COMPLETED and job_result.output_url:
            return await self.storage_manager.download_file(job_result.output_url)
        
        return None
    
    async def process_direct(self, file_content: bytes) -> bytes:
        """Process image directly without queueing"""
        return await self.processor.process(file_content)
    
    async def process_job(self, job: Job) -> None:
        """Process a background removal job (called by worker)"""
        try:
            # Update job status
            if job.job_id in self.jobs:
                self.jobs[job.job_id].status = JobStatus.PROCESSING
            
            # Download input file
            input_data = await self.storage_manager.download_file(job.input_file_path)
            
            # Process image
            start_time = datetime.utcnow()
            result_data = await self.processor.process(input_data)
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Upload result
            result_path = await self.storage_manager.upload_result_file(
                result_data,
                f"result_{job.job_id}.png",
                "image/png"
            )
            
            # Update job status
            if job.job_id in self.jobs:
                self.jobs[job.job_id].status = JobStatus.COMPLETED
                self.jobs[job.job_id].output_url = result_path
                self.jobs[job.job_id].processing_time = processing_time
                self.jobs[job.job_id].completed_at = datetime.utcnow()
            
            logger.info(f"Background removal job {job.job_id} completed in {processing_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Error processing background removal job {job.job_id}: {e}")
            
            # Update job status to failed
            if job.job_id in self.jobs:
                self.jobs[job.job_id].status = JobStatus.FAILED
                self.jobs[job.job_id].error_message = str(e)
            
            raise
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get service statistics"""
        await self._ensure_initialized()
        
        try:
            # Count jobs by status
            stats = {
                "total_jobs": len(self.jobs),
                "queued_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.QUEUED]),
                "processing_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.PROCESSING]),
                "completed_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.COMPLETED]),
                "failed_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.FAILED]),
            }
            
            # Calculate average processing time
            completed_jobs = [j for j in self.jobs.values() if j.status == JobStatus.COMPLETED and j.processing_time]
            if completed_jobs:
                avg_time = sum(j.processing_time for j in completed_jobs) / len(completed_jobs)
                stats["average_processing_time"] = avg_time
            
            # Get queue stats
            queue_stats = await self.queue_manager.get_queue_stats()
            if ServiceType.BACKGROUND_REMOVAL.value in queue_stats:
                stats["queue_depth"] = queue_stats[ServiceType.BACKGROUND_REMOVAL.value].get("message_count", 0)
            
            # Get storage stats
            storage_stats = await self.storage_manager.get_storage_stats()
            stats["storage_stats"] = storage_stats
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting background removal stats: {e}")
            return {"error": str(e)}
    
    async def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Clean up old completed/failed jobs"""
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
        
        jobs_to_remove = []
        for job_id, job_result in self.jobs.items():
            if (job_result.status in [JobStatus.COMPLETED, JobStatus.FAILED] and 
                job_result.created_at < cutoff_time):
                jobs_to_remove.append(job_id)
        
        for job_id in jobs_to_remove:
            # Clean up result files
            job_result = self.jobs[job_id]
            if job_result.output_url:
                try:
                    await self.storage_manager.delete_file(job_result.output_url)
                except Exception as e:
                    logger.warning(f"Failed to delete result file for job {job_id}: {e}")
            
            # Remove from memory
            del self.jobs[job_id]
        
        logger.info(f"Cleaned up {len(jobs_to_remove)} old jobs")
