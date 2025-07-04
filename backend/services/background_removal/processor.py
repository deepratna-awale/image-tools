import asyncio
import logging
from typing import Any
import io
import numpy as np
from rembg import remove

logger = logging.getLogger(__name__)


class BackgroundRemovalProcessor:
    """Image processing logic for background removal"""
    
    def __init__(self):
        # You can initialize different models here
        # For example: self.model = rembg.new_session('u2net')
        pass
    
    async def process(self, image_data: bytes) -> bytes:
        """Process image to remove background"""
        try:
            # Run rembg in thread pool since it's CPU intensive
            result = await asyncio.get_event_loop().run_in_executor(
                None, 
                self._remove_background, 
                image_data
            )
            return result
            
        except Exception as e:
            logger.error(f"Error in background removal processing: {e}")
            raise
    
    def _remove_background(self, image_data: bytes) -> bytes:
        """Synchronous background removal using rembg"""
        try:
            # Use rembg to remove background
            output = remove(image_data)
            return output
            
        except Exception as e:
            logger.error(f"Error in rembg processing: {e}")
            raise
    
    def remove_white_background(self, image: np.ndarray) -> np.ndarray:
        """
        Remove white background from an RGB image and return an RGBA image with transparency.
        White pixels become transparent, others remain opaque.
        """
        if image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("Input must be an RGB image (H, W, 3)")
        
        # Create alpha channel: 0 if white, 255 otherwise
        alpha = np.where((image == 255).all(axis=2), 0, 255).astype(np.uint8)
        rgba = np.dstack((image, alpha))
        return rgba
