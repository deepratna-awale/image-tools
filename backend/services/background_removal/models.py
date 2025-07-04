from pydantic import BaseModel
from typing import Optional, Dict, Any


class BackgroundRemovalRequest(BaseModel):
    """Request model for background removal"""
    model_name: Optional[str] = "u2net"  # Default model
    quality: Optional[str] = "high"  # high, medium, low
    format: Optional[str] = "png"  # Output format


class BackgroundRemovalParameters(BaseModel):
    """Parameters for background removal processing"""
    model: str = "u2net"
    alpha_matting: bool = False
    alpha_matting_foreground_threshold: int = 270
    alpha_matting_background_threshold: int = 10
    alpha_matting_erode_size: int = 10
