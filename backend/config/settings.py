from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import List, Optional
from urllib.parse import quote
import json
import os


def parse_list(value: str) -> List[str]:
    """Read a list setting written either as JSON (["a", "b"]) or comma-separated (a,b)"""
    value = (value or "").strip()
    if value.startswith("["):
        return [str(item).strip() for item in json.loads(value) if str(item).strip()]
    return [item.strip() for item in value.split(",") if item.strip()]


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
    # Sky swap segmentation model: any ADE20K semantic segmentation ONNX export with a
    # "pixel_values" input and [1, 150, h, w] logits works. The default (SegFormer-b0)
    # is released under NVIDIA's non-commercial license; swap the URL for commercial use.
    sky_model_url: str = "https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx"
    sky_model_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "segformer-b0-ade.onnx"
    )
    sky_model_input_size: int = 512
    sky_class_index: int = 2  # "sky" in ADE20K
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Public API for other apps (requests Caddy forwards from /api/v1/background-removal).
    # Comma-separated keys; callers send one as "X-API-Key" or "Authorization: Bearer".
    # With no keys set, the public API refuses every request.
    api_keys: str = ""
    # Per key, over a rolling minute: job submissions, and status/result requests
    api_rate_limit_per_minute: int = 20
    api_poll_limit_per_minute: int = 300
    # Images per UTC day: per key (unless set when the key is created), and across all
    # keys together. The total is the ceiling on how much CPU other apps can use.
    api_daily_limit_per_key: int = 200
    api_daily_limit_total: int = 1000
    api_max_keys: int = 20
    # Unlocks the /api-keys page for creating and revoking keys. Empty disables it.
    admin_token: str = ""

    # CORS: browser origins allowed to call the API directly, JSON or comma-separated.
    # The site's own frontend calls the API server-side, so it needs no entry here.
    allowed_origins: str = ""
    
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


    @property
    def api_key_list(self) -> List[str]:
        return parse_list(self.api_keys)

    @property
    def allowed_origin_list(self) -> List[str]:
        return parse_list(self.allowed_origins)


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    return settings
