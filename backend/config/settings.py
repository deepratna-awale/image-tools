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
    # Uploaded images, results and job records older than this are deleted (hourly
    # sweep in the API; local storage only). The privacy policy quotes this number.
    file_retention_hours: float = 24
    max_queue_size: int = 1000
    # Jobs the worker runs at once; keep 1 on CPU, raise it (e.g. 4) with a GPU endpoint
    worker_concurrency: int = 1
    # Cutout model for background removal/changing. BRIA RMBG 2.0 handles both photos
    # and anime well but is licensed CC BY-NC 4.0 (non-commercial); "isnet-general-use"
    # or "birefnet-general" are permissively licensed alternatives.
    rembg_model: str = "bria-rmbg"
    # Animated GIF/WebP/APNG cutouts: each frame is cut out on the GPU (one call per
    # frame), and longer animations keep this many frames. Without a GPU (or once its
    # monthly budget is used up) only the first frame is cut out.
    max_animation_frames: int = 100
    # Sky swap segmentation model: any ADE20K semantic segmentation ONNX export with a
    # "pixel_values" input and [1, 150, h, w] logits works. The default (SegFormer-b0)
    # is released under NVIDIA's non-commercial license; swap the URL for commercial use.
    sky_model_url: str = "https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx"
    sky_model_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "segformer-b0-ade.onnx"
    )
    sky_model_input_size: int = 512
    sky_class_index: int = 2  # "sky" in ADE20K
    # AI Shield: Stable Diffusion VAEs (diffusers folders with config.json and
    # diffusion_pytorch_model.safetensors) whose image encoders the cloak is aimed at.
    # Comma-separated; the Docker image bakes in the SD 1.x/2.x and SDXL ones.
    ai_shield_model_dirs: str = ",".join(
        os.path.join(os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), name)
        for name in ("sd-vae-ft-mse", "sdxl-vae")
    )
    # CPU threads for the cloak; 0 uses every core
    ai_shield_threads: int = 0
    # Upscaler: Real-ESRGAN x4 models (BSD-3-Clause) for photos and for anime/art, and
    # a CLIP model (open_clip ViT-B-32, MIT) that tells the two apart. The Docker
    # images bake all three into U2NET_HOME.
    upscale_photo_model_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "RealESRGAN_x4plus.pth"
    )
    upscale_anime_model_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "RealESRGAN_x4plus_anime_6B.pth"
    )
    upscale_style_model_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "clip-vit-b-32-laion400m.pt"
    )
    # Largest result, and the largest input the CPU (no GPU endpoint, or a fallback)
    # will take; about a minute per megapixel per core on the photo model
    upscale_max_output_pixels: int = 4096 * 4096
    upscale_cpu_max_input_pixels: int = 1024 * 1024
    # Watermark remover (GPU only): Florence-2 (MIT) finds the watermark, then a diffusion
    # model repaints it: "flux" (FLUX.1 Kontext [dev] edits it out, best results,
    # non-commercial license) or "sdxl" (SDXL Inpainting 0.1, OpenRAIL++, commercial use
    # allowed). The
    # GPU image bakes the chosen models into U2NET_HOME (deployment/gpu/Dockerfile).
    watermark_detector_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "florence-2-large"
    )
    watermark_fill_model: str = "flux"
    watermark_flux_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "flux-kontext"
    )
    watermark_sdxl_path: str = os.path.join(
        os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net")), "sdxl-inpaint"
    )
    # Each masked region is cropped with surrounding context and scaled so its longer
    # side is this many pixels for the model, then only the masked pixels are pasted back
    watermark_work_size: int = 1024
    watermark_steps: int = 28
    watermark_max_input_pixels: int = 6000 * 6000

    # GPU offload: with both set, the worker sends model work (cutouts, sky masks,
    # AI Shield) to this RunPod Serverless endpoint (see deployment/gpu/README.md),
    # which bills per second and scales to zero. Without them, everything runs on CPU.
    runpod_api_key: Optional[str] = None
    runpod_endpoint_id: Optional[str] = None
    runpod_api_url: str = "https://api.runpod.ai/v2"
    # Longest wait for one GPU job, including a cold start
    gpu_timeout_seconds: float = 900
    # Run the job on this server's CPU if the GPU endpoint fails or times out
    gpu_fallback_to_cpu: bool = True
    # Monthly GPU spending cap in dollars (estimated per job, see core/gpu_budget.py);
    # once reached, jobs run on the CPU until the next UTC month. 0 means no cap.
    gpu_monthly_budget_usd: float = 10
    # The endpoint GPU's price, and how long a worker stays warm after a job
    # (the endpoint's idle timeout), both used for that estimate
    gpu_price_per_hour: float = 0.69
    gpu_idle_seconds: float = 5
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Public API for other apps (requests Caddy forwards from /api/v1/background-removal,
    # /api/v1/upscaling and /api/v1/watermark-removal).
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
    # Self-serve keys anyone can create on /api-keys. They get tighter limits than
    # admin keys, share their own daily pool inside the all-keys total, and each
    # network address may only create a few a day.
    api_public_signup: bool = True
    api_public_daily_limit_per_key: int = 50
    api_public_daily_limit_total: int = 300
    api_public_rate_limit_per_minute: int = 5
    api_public_keys_per_ip_per_day: int = 3
    api_public_active_keys_per_ip: int = 5
    api_public_signups_per_day: int = 100
    api_public_max_keys: int = 2000

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
    def ai_shield_model_dir_list(self) -> List[str]:
        return parse_list(self.ai_shield_model_dirs)

    @property
    def gpu_enabled(self) -> bool:
        return bool(self.runpod_api_key and self.runpod_endpoint_id)

    @property
    def allowed_origin_list(self) -> List[str]:
        return parse_list(self.allowed_origins)


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    return settings
