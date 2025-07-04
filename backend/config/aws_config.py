import boto3
from typing import Optional
from .settings import settings


class AWSConfig:
    """AWS service configuration and client management"""
    
    def __init__(self):
        self._s3_client = None
        self._sqs_client = None
        self._ecs_client = None
        
    @property
    def s3_client(self):
        if self._s3_client is None:
            self._s3_client = boto3.client(
                's3',
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key
            )
        return self._s3_client
    
    @property
    def sqs_client(self):
        if self._sqs_client is None:
            self._sqs_client = boto3.client(
                'sqs',
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key
            )
        return self._sqs_client
    
    @property
    def ecs_client(self):
        if self._ecs_client is None:
            self._ecs_client = boto3.client(
                'ecs',
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key
            )
        return self._ecs_client


# Global AWS config instance
aws_config = AWSConfig()
