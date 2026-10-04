import boto3
import asyncio
import json
import logging
from typing import Dict, Any, Optional, Callable
from .queue_manager import QueueManager
from ..models.job import Job, ServiceType
from config.settings import settings
from config.aws_config import aws_config

logger = logging.getLogger(__name__)


class SQSAdapter(QueueManager):
    """AWS SQS implementation of QueueManager"""
    
    def __init__(self):
        self.sqs_client = None
        self.queue_urls: Dict[str, str] = {}
        
    async def connect(self) -> None:
        """Initialize connection to SQS"""
        try:
            self.sqs_client = aws_config.sqs_client
            
            # Get or create queue URLs for each service type
            for service_type in ServiceType:
                # Handle both enum and string values
                service_type_value = service_type.value if hasattr(service_type, 'value') else service_type
                queue_name = f"{service_type_value.replace('_', '-')}-queue"
                
                try:
                    # Try to get existing queue
                    response = self.sqs_client.get_queue_url(QueueName=queue_name)
                    self.queue_urls[service_type_value] = response['QueueUrl']
                except self.sqs_client.exceptions.QueueDoesNotExist:
                    # Create queue if it doesn't exist
                    response = self.sqs_client.create_queue(
                        QueueName=queue_name,
                        Attributes={
                            'VisibilityTimeout': '300',
                            'MessageRetentionPeriod': '1209600',  # 14 days
                            'ReceiveMessageWaitTimeSeconds': '20'  # Long polling
                        }
                    )
                    self.queue_urls[service_type_value] = response['QueueUrl']
                    
            logger.info("Connected to SQS successfully")
            
        except Exception as e:
            logger.error(f"Failed to connect to SQS: {e}")
            raise
    
    async def disconnect(self) -> None:
        """Close connection to SQS (no persistent connection needed)"""
        self.sqs_client = None
        logger.info("Disconnected from SQS")
    
    async def send_job(self, job: Job) -> None:
        """Send a job to the appropriate SQS queue"""
        try:
            # Handle both enum and string values for service_type
            service_type_value = job.service_type.value if hasattr(job.service_type, 'value') else job.service_type
            queue_url = self.queue_urls.get(service_type_value)
            if not queue_url:
                await self.connect()
                queue_url = self.queue_urls[service_type_value]
            
            message_body = json.dumps(job.to_dict())
            
            # Run in thread pool since boto3 is synchronous
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.sqs_client.send_message(
                    QueueUrl=queue_url,
                    MessageBody=message_body,
                    MessageAttributes={
                        'service_type': {
                            'StringValue': service_type_value,
                            'DataType': 'String'
                        },
                        'job_id': {
                            'StringValue': job.job_id,
                            'DataType': 'String'
                        }
                    }
                )
            )
            
            logger.info(f"Job {job.job_id} sent to SQS queue {service_type_value}")
            
        except Exception as e:
            logger.error(f"Error sending job to SQS: {e}")
            raise
    
    async def start_worker(self, 
                          processor: Callable[[Job], Any],
                          queue_name: str = None) -> None:
        """Start processing jobs from SQS queue"""
        try:
            if not self.sqs_client:
                await self.connect()
            
            # If no specific queue name, process all service queues
            if queue_name is None:
                tasks = []
                for service_type in ServiceType:
                    # Handle both enum and string values
                    service_type_value = service_type.value if hasattr(service_type, 'value') else service_type
                    task = asyncio.create_task(
                        self._process_queue(service_type_value, processor)
                    )
                    tasks.append(task)
                await asyncio.gather(*tasks)
            else:
                await self._process_queue(queue_name, processor)
                
        except Exception as e:
            logger.error(f"Error starting SQS worker: {e}")
            raise
    
    async def _process_queue(self, service_type: str, processor: Callable[[Job], Any]) -> None:
        """Process messages from a specific SQS queue"""
        queue_url = self.queue_urls[service_type]
        
        while True:
            try:
                # Receive messages from SQS
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.sqs_client.receive_message(
                        QueueUrl=queue_url,
                        MaxNumberOfMessages=1,
                        WaitTimeSeconds=20,  # Long polling
                        MessageAttributeNames=['All']
                    )
                )
                
                messages = response.get('Messages', [])
                
                for message in messages:
                    try:
                        # Parse job from message
                        job_data = json.loads(message['Body'])
                        job = Job.from_dict(job_data)
                        
                        logger.info(f"Processing job {job.job_id} from SQS queue {service_type}")
                        
                        # Process the job
                        await processor(job)
                        
                        # Delete message after successful processing
                        await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: self.sqs_client.delete_message(
                                QueueUrl=queue_url,
                                ReceiptHandle=message['ReceiptHandle']
                            )
                        )
                        
                    except Exception as e:
                        logger.error(f"Error processing SQS message: {e}")
                        # Message will become visible again after visibility timeout
                        
            except Exception as e:
                logger.error(f"Error in SQS _process_queue for {service_type}: {e}")
                await asyncio.sleep(5)
    
    async def get_queue_stats(self) -> Dict[str, Any]:
        """Get SQS queue statistics"""
        try:
            stats = {}
            
            if not self.sqs_client:
                await self.connect()
            
            for service_type in ServiceType:
                # Handle both enum and string values
                service_type_value = service_type.value if hasattr(service_type, 'value') else service_type
                queue_url = self.queue_urls[service_type_value]
                
                # Get queue attributes
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.sqs_client.get_queue_attributes(
                        QueueUrl=queue_url,
                        AttributeNames=['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
                    )
                )
                
                attributes = response['Attributes']
                stats[service_type_value] = {
                    "message_count": int(attributes.get('ApproximateNumberOfMessages', 0)),
                    "messages_in_flight": int(attributes.get('ApproximateNumberOfMessagesNotVisible', 0))
                }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting SQS queue stats: {e}")
            return {}
    
    async def purge_queue(self, queue_name: str) -> None:
        """Clear all messages from an SQS queue"""
        try:
            if not self.sqs_client:
                await self.connect()
            
            queue_url = self.queue_urls[queue_name]
            
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.sqs_client.purge_queue(QueueUrl=queue_url)
            )
            
            logger.info(f"Purged SQS queue {queue_name}")
            
        except Exception as e:
            logger.error(f"Error purging SQS queue {queue_name}: {e}")
            raise
