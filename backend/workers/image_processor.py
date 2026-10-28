import asyncio
import logging
import signal
import sys
from typing import Dict, Any

from core.models.job import Job, ServiceType
from core.messaging.queue_manager import QueueManager
from core.messaging.rabbitmq_adapter import RabbitMQAdapter
from core.messaging.sqs_adapter import SQSAdapter
from core.gpu import GpuProcessor
from services.background_removal.service import BackgroundRemovalService
from services.background_changing.service import BackgroundChangingService
from services.sky_replacement.service import SkyReplacementService
from services.ai_shield.service import AIShieldService
from services.upscaling.service import UpscalingService
from config.settings import settings

logger = logging.getLogger(__name__)


class ImageProcessorWorker:
    """Generic worker for processing image jobs"""
    
    def __init__(self):
        # Initialize queue manager
        if settings.queue_type == "sqs":
            self.queue_manager: QueueManager = SQSAdapter()
        else:
            self.queue_manager: QueueManager = RabbitMQAdapter()
        
        # Initialize services
        self.services = {
            ServiceType.BACKGROUND_REMOVAL: BackgroundRemovalService(),
            ServiceType.BACKGROUND_CHANGING: BackgroundChangingService(),
            ServiceType.SKY_REPLACEMENT: SkyReplacementService(),
            ServiceType.AI_SHIELD: AIShieldService(),
            ServiceType.UPSCALING: UpscalingService(),
            # ServiceType.OUTPAINTING: OutpaintingService(),
        }

        # Model work goes to the GPU endpoint when one is configured
        if settings.gpu_enabled:
            for service_type, service in self.services.items():
                service.processor = GpuProcessor(service_type.value, service.processor)
            logger.info(f"Sending model work to GPU endpoint {settings.runpod_endpoint_id}")
        
        self.running = False
    
    async def start(self):
        """Start the worker"""
        logger.info("Starting image processor worker")
        
        try:
            # Connect to queue
            await self.queue_manager.connect()
            
            # Set up signal handlers for graceful shutdown
            loop = asyncio.get_event_loop()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, self._signal_handler)
            
            self.running = True
            
            # Start processing jobs
            await self.queue_manager.start_worker(self.process_job)
            
        except Exception as e:
            logger.error(f"Error starting worker: {e}")
            raise
    
    async def stop(self):
        """Stop the worker gracefully"""
        logger.info("Stopping image processor worker")
        self.running = False
        await self.queue_manager.disconnect()
    
    def _signal_handler(self):
        """Handle shutdown signals"""
        logger.info("Received shutdown signal")
        asyncio.create_task(self.stop())
    
    async def process_job(self, job: Job):
        """Process a job based on its service type"""
        try:
            logger.info(f"Processing job {job.job_id} of type {job.service_type}")
            
            # Get the appropriate service
            service = self.services.get(job.service_type)
            if not service:
                raise ValueError(f"No service available for {job.service_type}")
            
            # Process the job
            await service.process_job(job)
            
            logger.info(f"Successfully processed job {job.job_id}")
            
        except Exception as e:
            logger.error(f"Error processing job {job.job_id}: {e}")
            raise


async def main():
    """Main worker entry point"""
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    worker = ImageProcessorWorker()
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        logger.info("Worker interrupted by user")
    except Exception as e:
        logger.error(f"Worker failed: {e}")
        sys.exit(1)
    finally:
        await worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
