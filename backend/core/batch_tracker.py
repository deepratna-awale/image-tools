import json
import os
from typing import Dict, Any, Optional
from datetime import datetime


class BatchJobTracker:
    """Persistent batch job tracking using file storage"""
    
    def __init__(self, storage_path: str = "./uploads"):
        self.batch_file = os.path.join(storage_path, "batch_jobs.json")
        self.jobs_file = os.path.join(storage_path, "job_statuses.json")
        self.ensure_files_exist()
    
    def ensure_files_exist(self):
        """Ensure the batch jobs and job status files exist"""
        for file_path in [self.batch_file, self.jobs_file]:
            if not os.path.exists(file_path):
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, 'w') as f:
                    json.dump({}, f)

    def load_data(self) -> Dict[str, Any]:
        """Load batch data from file"""
        try:
            with open(self.batch_file, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def load_job_data(self) -> Dict[str, Any]:
        """Load job status data from file"""
        try:
            with open(self.jobs_file, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def save_data(self, data: Dict[str, Any]):
        """Save batch data to file"""
        try:
            with open(self.batch_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
        except Exception as e:
            print(f"Error saving batch data: {e}")

    def save_job_data(self, data: Dict[str, Any]):
        """Save job status data to file"""
        try:
            with open(self.jobs_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
        except Exception as e:
            print(f"Error saving job data: {e}")

    def save_batch_info(self, batch_id: str, job_ids: list, total_files: int):
        """Save batch information"""
        data = self.load_data()
        data[batch_id] = {
            "job_ids": job_ids,
            "total_files": total_files,
            "created_at": datetime.utcnow().isoformat()
        }
        self.save_data(data)

    def update_job_status(self, job_id: str, status: str, **kwargs):
        """Update job status and additional info"""
        job_data = self.load_job_data()
        if job_id not in job_data:
            job_data[job_id] = {}
        
        job_data[job_id]["status"] = status
        job_data[job_id]["updated_at"] = datetime.utcnow().isoformat()
        
        # Update any additional fields
        for key, value in kwargs.items():
            job_data[job_id][key] = value
        
        self.save_job_data(job_data)

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status and info"""
        job_data = self.load_job_data()
        return job_data.get(job_id)

    def get_batch_job_ids(self, batch_id: str) -> Optional[list]:
        """Get job IDs for a batch"""
        data = self.load_data()
        batch_info = data.get(batch_id)
        return batch_info.get("job_ids") if batch_info else None
    
    def get_batch_info(self, batch_id: str) -> Optional[Dict[str, Any]]:
        """Get full batch information"""
        data = self.load_data()
        return data.get(batch_id)
