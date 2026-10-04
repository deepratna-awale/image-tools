import asyncio
import logging
import os
import zipfile
import io
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from core.models.job import Job, ServiceType, JobStatus, JobResult, BatchJob, BatchJobResult
from core.messaging.queue_manager import QueueManager
from core.messaging.rabbitmq_adapter import RabbitMQAdapter
from core.messaging.sqs_adapter import SQSAdapter
from core.storage.storage_manager import StorageManager
from core.storage.local_storage import LocalStorage
from core.storage.s3_storage import S3Storage
from core.batch_tracker import BatchJobTracker
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
        
        # Initialize batch tracker for persistent storage
        self.batch_tracker = BatchJobTracker(settings.local_storage_path)
        
        # In-memory job tracking (use Redis in production)
        self.jobs: Dict[str, JobResult] = {}
        self.batch_jobs: Dict[str, BatchJobResult] = {}
        self.job_to_batch_mapping: Dict[str, str] = {}
        
        # Initialize connections
        self._initialized = False
    
    async def _ensure_initialized(self):
        """Ensure service is properly initialized"""
        if not self._initialized:
            await self.queue_manager.connect()
            self._initialized = True

    async def submit_batch_job(self, files_data: List[tuple[bytes, str]]) -> BatchJob:
        """Submit a batch of background removal jobs"""
        await self._ensure_initialized()
        
        if len(files_data) > 10:
            raise ValueError("Maximum 10 files allowed per batch")
        
        try:
            # Create batch job
            batch_job = BatchJob(
                service_type=ServiceType.BACKGROUND_REMOVAL,
                total_files=len(files_data)
            )
            
            # Create individual jobs for each file
            individual_jobs = []
            for file_content, filename in files_data:
                # Upload file to storage
                file_path = await self.storage_manager.upload_file(
                    file_content, 
                    f"batch_{batch_job.batch_id}_{filename}",
                    "image/jpeg"
                )
                
                # Create individual job
                job = Job(
                    service_type=ServiceType.BACKGROUND_REMOVAL,
                    input_file_path=file_path,
                    status=JobStatus.QUEUED,
                    parameters={"batch_id": batch_job.batch_id}
                )
                
                individual_jobs.append(job)
                
                # Store individual job info with batch_id reference
                self.jobs[job.job_id] = JobResult(
                    job_id=job.job_id,
                    status=job.status,
                    service_type=job.service_type,
                    created_at=job.created_at
                )
                
                # Send individual job to queue
                await self.queue_manager.send_job(job)
            
            # Update batch job with individual jobs
            batch_job.jobs = individual_jobs
            
            # Store batch job info with job IDs mapping
            self.batch_jobs[batch_job.batch_id] = BatchJobResult(
                batch_id=batch_job.batch_id,
                status=batch_job.status,
                service_type=batch_job.service_type,
                total_files=batch_job.total_files,
                completed_files=0,
                failed_files=0,
                progress=0.0,
                created_at=batch_job.created_at,
                results=[]
            )
            
            # Store mapping of job IDs to batch ID for easier lookup
            if not hasattr(self, 'job_to_batch_mapping'):
                self.job_to_batch_mapping = {}
            
            for job in individual_jobs:
                self.job_to_batch_mapping[job.job_id] = batch_job.batch_id
            
            # Persist batch information to file for cross-process access
            job_ids = [job.job_id for job in individual_jobs]
            self.batch_tracker.save_batch_info(batch_job.batch_id, job_ids, batch_job.total_files)
            
            logger.info(f"Batch background removal job {batch_job.batch_id} submitted with {len(files_data)} files")
            return batch_job
            
        except Exception as e:
            logger.error(f"Error submitting batch background removal job: {e}")
            raise

    async def get_batch_job_status(self, batch_id: str) -> Optional[BatchJobResult]:
        """Get batch job status using persistent storage"""
        # Get batch info from persistent storage
        batch_info = self.batch_tracker.get_batch_info(batch_id)
        if not batch_info:
            return None
        
        # Get batch result from memory or create new one
        batch_result = self.batch_jobs.get(batch_id)
        if not batch_result:
            batch_result = BatchJobResult(
                batch_id=batch_id,
                status=JobStatus.QUEUED,
                service_type=ServiceType.BACKGROUND_REMOVAL,
                total_files=batch_info["total_files"],
                completed_files=0,
                failed_files=0,
                progress=0.0,
                created_at=datetime.fromisoformat(batch_info["created_at"]),
                results=[]
            )
            self.batch_jobs[batch_id] = batch_result
        
        # Get job IDs for this batch from persistent storage
        batch_job_ids = self.batch_tracker.get_batch_job_ids(batch_id)
        if not batch_job_ids:
            logger.warning(f"No job IDs found for batch {batch_id}")
            return batch_result
        
        completed_count = 0
        failed_count = 0
        results = []
        
        # Check each job status from persistent storage
        for job_id in batch_job_ids:
            # Get job status from persistent storage
            job_status_info = self.batch_tracker.get_job_status(job_id)
            
            if job_status_info:
                status = JobStatus(job_status_info.get("status", "queued"))
                
                if status == JobStatus.COMPLETED:
                    job_result = JobResult(
                        job_id=job_id,
                        status=status,
                        service_type=ServiceType.BACKGROUND_REMOVAL,
                        output_url=job_status_info.get("output_url"),
                        processing_time=job_status_info.get("processing_time"),
                        created_at=datetime.utcnow(),  # We could store this too
                        completed_at=datetime.fromisoformat(job_status_info["completed_at"]) if job_status_info.get("completed_at") else None
                    )
                    completed_count += 1
                    results.append(job_result)
                    logger.debug(f"Found completed job {job_id} for batch {batch_id}")
                    
                elif status == JobStatus.FAILED:
                    job_result = JobResult(
                        job_id=job_id,
                        status=status,
                        service_type=ServiceType.BACKGROUND_REMOVAL,
                        error_message=job_status_info.get("error_message"),
                        created_at=datetime.utcnow()
                    )
                    failed_count += 1
                    results.append(job_result)
                    logger.debug(f"Found failed job {job_id} for batch {batch_id}")
                    
                elif status == JobStatus.PROCESSING:
                    job_result = JobResult(
                        job_id=job_id,
                        status=status,
                        service_type=ServiceType.BACKGROUND_REMOVAL,
                        created_at=datetime.utcnow()
                    )
                    results.append(job_result)
                    logger.debug(f"Found processing job {job_id} for batch {batch_id}")
                    
                else:  # QUEUED
                    job_result = JobResult(
                        job_id=job_id,
                        status=status,
                        service_type=ServiceType.BACKGROUND_REMOVAL,
                        created_at=datetime.utcnow()
                    )
                    results.append(job_result)
            else:
                # No status info found, assume queued
                job_result = JobResult(
                    job_id=job_id,
                    status=JobStatus.QUEUED,
                    service_type=ServiceType.BACKGROUND_REMOVAL,
                    created_at=datetime.utcnow()
                )
                results.append(job_result)
        
        # Update batch job status
        batch_result.completed_files = completed_count
        batch_result.failed_files = failed_count
        batch_result.progress = ((completed_count + failed_count) / batch_result.total_files) * 100 if batch_result.total_files > 0 else 0
        batch_result.results = results
        
        # Update overall status
        total_processed = completed_count + failed_count
        if total_processed >= batch_result.total_files:
            if failed_count == batch_result.total_files:
                batch_result.status = JobStatus.FAILED
            else:
                batch_result.status = JobStatus.COMPLETED
                if batch_result.completed_at is None:
                    batch_result.completed_at = datetime.utcnow()
                
                # Always try to create zip file when batch is completed and we have results
                if completed_count > 0 and not batch_result.zip_url:
                    try:
                        batch_result.zip_url = await self._create_results_zip(batch_id, results)
                        logger.info(f"Created zip file for batch {batch_id}: {batch_result.zip_url}")
                    except Exception as e:
                        logger.error(f"Failed to create zip file for batch {batch_id}: {e}")
        elif total_processed > 0:
            batch_result.status = JobStatus.PROCESSING
        
        logger.info(f"Batch {batch_id} status: {batch_result.status}, completed: {completed_count}/{batch_result.total_files}, failed: {failed_count}, progress: {batch_result.progress:.1f}%")
        return batch_result

    async def _create_results_zip(self, batch_id: str, results: List[JobResult]) -> Optional[str]:
        """Create a zip file containing all completed results"""
        try:
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for i, result in enumerate(results):
                    if result.status == JobStatus.COMPLETED and result.output_url:
                        try:
                            # Download result file
                            file_data = await self.storage_manager.download_file(result.output_url)
                            if file_data:
                                # Add to zip with a proper filename
                                filename = f"processed_image_{i+1}.png"
                                zip_file.writestr(filename, file_data)
                        except Exception as e:
                            logger.warning(f"Failed to add result {result.job_id} to zip: {e}")
            
            zip_buffer.seek(0)
            
            # Upload zip file to storage
            zip_path = await self.storage_manager.upload_result_file(
                zip_buffer.getvalue(),
                f"batch_results_{batch_id}.zip",
                "application/zip"
            )
            
            return zip_path
            
        except Exception as e:
            logger.error(f"Error creating results zip for batch {batch_id}: {e}")
            return None

    async def get_batch_results_zip(self, batch_id: str) -> Optional[bytes]:
        """Get the zip file containing all batch results"""
        batch_result = self.batch_jobs.get(batch_id)
        if not batch_result or not batch_result.zip_url:
            # Rebuild from the shared tracker (e.g. after an API restart)
            batch_result = await self.get_batch_job_status(batch_id)
        if not batch_result or not batch_result.zip_url:
            return None
        
        try:
            return await self.storage_manager.download_file(batch_result.zip_url)
        except Exception as e:
            logger.error(f"Error downloading batch results zip: {e}")
            return None



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
            
            self.batch_tracker.update_job_status(job.job_id, JobStatus.QUEUED.value)

            # Send to queue
            await self.queue_manager.send_job(job)
            
            logger.info(f"Background removal job {job.job_id} submitted")
            return job
            
        except Exception as e:
            logger.error(f"Error submitting background removal job: {e}")
            raise
    
    def _sync_from_tracker(self, job_id: str) -> Optional[JobResult]:
        """Merge the worker-reported status (shared tracker file) into the in-memory job"""
        info = self.batch_tracker.get_job_status(job_id)
        job_result = self.jobs.get(job_id)
        if not info:
            return job_result

        if not job_result:
            job_result = JobResult(
                job_id=job_id,
                status=JobStatus(info.get("status", JobStatus.QUEUED.value)),
                service_type=ServiceType.BACKGROUND_REMOVAL,
            )
            self.jobs[job_id] = job_result

        job_result.status = JobStatus(info.get("status", job_result.status))
        job_result.output_url = info.get("output_url") or job_result.output_url
        job_result.error_message = info.get("error_message") or job_result.error_message
        job_result.processing_time = info.get("processing_time") or job_result.processing_time
        if info.get("completed_at"):
            job_result.completed_at = datetime.fromisoformat(info["completed_at"])
        return job_result

    async def get_job_status(self, job_id: str) -> Optional[JobResult]:
        """Get job status"""
        job_result = self._sync_from_tracker(job_id)
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
        job_result = self._sync_from_tracker(job_id)
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
    

    
    async def process_job(self, job: Job) -> None:
        """Process a background removal job (called by worker)"""
        try:
            # Update job status to processing (both in-memory and persistent)
            if job.job_id in self.jobs:
                self.jobs[job.job_id].status = JobStatus.PROCESSING
            self.batch_tracker.update_job_status(job.job_id, JobStatus.PROCESSING.value)
            
            logger.info(f"Starting processing job {job.job_id}")
            
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
            
            # Update job status to completed (both in-memory and persistent)
            completed_at = datetime.utcnow()
            if job.job_id in self.jobs:
                self.jobs[job.job_id].status = JobStatus.COMPLETED
                self.jobs[job.job_id].output_url = result_path
                self.jobs[job.job_id].processing_time = processing_time
                self.jobs[job.job_id].completed_at = completed_at
            
            # Persist job completion
            self.batch_tracker.update_job_status(
                job.job_id, 
                JobStatus.COMPLETED.value,
                output_url=result_path,
                processing_time=processing_time,
                completed_at=completed_at.isoformat()
            )
            
            logger.info(f"Background removal job {job.job_id} completed in {processing_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Error processing background removal job {job.job_id}: {e}")
            
            # Update job status to failed (both in-memory and persistent)
            if job.job_id in self.jobs:
                self.jobs[job.job_id].status = JobStatus.FAILED
                self.jobs[job.job_id].error_message = str(e)
            
            self.batch_tracker.update_job_status(
                job.job_id, 
                JobStatus.FAILED.value,
                error_message=str(e)
            )
            
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
