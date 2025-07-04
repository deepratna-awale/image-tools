import aio_pika
import asyncio
import json
import logging
from typing import Dict, Any, Optional, Callable
from .queue_manager import QueueManager
from ..models.job import Job, ServiceType
from config.settings import settings

logger = logging.getLogger(__name__)


class RabbitMQAdapter(QueueManager):
    """RabbitMQ implementation of QueueManager"""
    
    def __init__(self):
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.queues: Dict[str, aio_pika.Queue] = {}
        
    async def connect(self) -> None:
        """Initialize connection to RabbitMQ"""
        try:
            self.connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=1)
            
            # Declare queues for each service type
            for service_type in ServiceType:
                # Handle both enum and string values
                service_type_value = service_type.value if hasattr(service_type, 'value') else service_type
                queue_name = f"{service_type_value}_queue"
                queue = await self.channel.declare_queue(
                    queue_name, 
                    durable=True
                )
                self.queues[service_type_value] = queue
                
            logger.info("Connected to RabbitMQ successfully")
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise
    
    async def disconnect(self) -> None:
        """Close connection to RabbitMQ"""
        try:
            if self.connection and not self.connection.is_closed:
                await self.connection.close()
            logger.info("Disconnected from RabbitMQ")
        except Exception as e:
            logger.error(f"Error disconnecting from RabbitMQ: {e}")
    
    async def send_job(self, job: Job) -> None:
        """Send a job to the appropriate queue"""
        try:
            # Handle both enum and string values for service_type
            service_type_value = job.service_type.value if hasattr(job.service_type, 'value') else job.service_type
            queue_name = f"{service_type_value}_queue"
            
            if not self.channel:
                await self.connect()
            
            message_body = json.dumps(job.to_dict())
            
            await self.channel.default_exchange.publish(
                aio_pika.Message(
                    body=message_body.encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                ),
                routing_key=queue_name,
            )
            
            logger.info(f"Job {job.job_id} sent to queue {queue_name}")
            
        except Exception as e:
            logger.error(f"Error sending job to queue: {e}")
            raise
    
    async def start_worker(self, 
                          processor: Callable[[Job], Any],
                          queue_name: str = None) -> None:
        """Start processing jobs from the queue"""
        try:
            if not self.channel:
                await self.connect()
            
            # If no specific queue name, process all service queues
            if queue_name is None:
                tasks = []
                for service_type in ServiceType:
                    # Handle both enum and string values
                    service_type_value = service_type.value if hasattr(service_type, 'value') else service_type
                    queue_name = f"{service_type_value}_queue"
                    task = asyncio.create_task(
                        self._process_queue(queue_name, processor)
                    )
                    tasks.append(task)
                await asyncio.gather(*tasks)
            else:
                await self._process_queue(queue_name, processor)
                
        except Exception as e:
            logger.error(f"Error starting worker: {e}")
            raise
    
    async def _process_queue(self, queue_name: str, processor: Callable[[Job], Any]) -> None:
        """Process messages from a specific queue"""
        try:
            queue = await self.channel.declare_queue(queue_name, durable=True)
            
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    try:
                        async with message.process():
                            # Parse job from message
                            job_data = json.loads(message.body.decode())
                            job = Job.from_dict(job_data)
                            
                            logger.info(f"Processing job {job.job_id} from {queue_name}")
                            
                            # Process the job
                            await processor(job)
                            
                    except Exception as e:
                        logger.error(f"Error processing message from {queue_name}: {e}")
                        # In production, send to dead letter queue
                        
        except Exception as e:
            logger.error(f"Error in _process_queue for {queue_name}: {e}")
            # Restart processing after a delay
            await asyncio.sleep(5)
            await self._process_queue(queue_name, processor)
    
    async def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics"""
        try:
            stats = {}
            
            if not self.channel:
                await self.connect()
            
            for service_type in ServiceType:
                # Handle both enum and string values
                service_type_value = service_type.value if hasattr(service_type, 'value') else service_type
                queue_name = f"{service_type_value}_queue"
                queue = await self.channel.declare_queue(
                    queue_name, 
                    durable=True, 
                    passive=True
                )
                
                # Get queue info
                declare_result = await self.channel.queue_declare(
                    queue_name, 
                    passive=True
                )
                
                stats[service_type_value] = {
                    "message_count": declare_result.method.message_count,
                    "consumer_count": declare_result.method.consumer_count
                }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting queue stats: {e}")
            return {}
    
    async def purge_queue(self, queue_name: str) -> None:
        """Clear all messages from a queue"""
        try:
            if not self.channel:
                await self.connect()
            
            queue = await self.channel.declare_queue(queue_name, durable=True)
            await queue.purge()
            
            logger.info(f"Purged queue {queue_name}")
            
        except Exception as e:
            logger.error(f"Error purging queue {queue_name}: {e}")
            raise
