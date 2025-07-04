from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Callable
from ..models.job import Job


class QueueManager(ABC):
    """Abstract base class for queue management"""
    
    @abstractmethod
    async def connect(self) -> None:
        """Initialize connection to the queue service"""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection to the queue service"""
        pass
    
    @abstractmethod
    async def send_job(self, job: Job) -> None:
        """Send a job to the queue"""
        pass
    
    @abstractmethod
    async def start_worker(self, 
                          processor: Callable[[Job], Any],
                          queue_name: str = None) -> None:
        """Start processing jobs from the queue"""
        pass
    
    @abstractmethod
    async def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics"""
        pass
    
    @abstractmethod
    async def purge_queue(self, queue_name: str) -> None:
        """Clear all messages from a queue"""
        pass
