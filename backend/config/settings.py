from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import Optional
from urllib.parse import quote
import os


class Settings(BaseSettings):
    # Application
    app_name: str = "Image Processing API"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_prefix: str = "/api/v1"
    
    # Queue Configuration
    queue_type: str = "rabbitmq"  # rabbitmq or sqs
    # Either set RABBITMQ_URL directly, or let it be built from the parts below
    # (the user/password names match the rabbitmq image's own variables).
    rabbitmq_url: Optional[str] = None
    rabbitmq_host: str = "localhost"
    rabbitmq_port: int = 5672
    rabbitmq_default_user: str = "guest"
    rabbitmq_default_pass: str = "guest"
    
    # AWS Configuration
    aws_region: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    
    # SQS Configuration
    sqs_queue_url: Optional[str] = None
    sqs_dlq_url: Optional[str] = None
    
    # Storage Configuration
    storage_type: str = "local"  # local or s3
    local_storage_path: str = "./uploads"
    s3_bucket_name: Optional[str] = None
    s3_results_bucket: Optional[str] = None
    
    # Database
    database_url: Optional[str] = None
    redis_url: Optional[str] = None
    
    # Processing
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    job_result_ttl: int = 3600  # 1 hour
    max_queue_size: int = 1000
    worker_concurrency: int = 1
    rembg_model: str = "u2net"
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # CORS
    allowed_origins: list = ["*"]
    allowed_methods: list = ["*"]
    allowed_headers: list = ["*"]
    
    # Monitoring
    enable_metrics: bool = True
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"

    @model_validator(mode="after")
    def _build_rabbitmq_url(self):
        if not self.rabbitmq_url:
            user = quote(self.rabbitmq_default_user, safe="")
            password = quote(self.rabbitmq_default_pass, safe="")
            self.rabbitmq_url = f"amqp://{user}:{password}@{self.rabbitmq_host}:{self.rabbitmq_port}/"
        return self


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    return settings
