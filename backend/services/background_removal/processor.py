import asyncio
import logging
from functools import lru_cache
from typing import Any
import io
import numpy as np
from rembg import new_session, remove

from config.settings import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=None)
def get_rembg_session(model_name: str):
    """One model session per process, shared by every tool that needs a cutout"""
    return new_session(model_name)


class BackgroundRemovalProcessor:
    """Image processing logic for background removal"""
    
    def __init__(self):
        # The model session is created on first use so the API process,
        # which never processes images, does not load it.
        self._session = None

    @property
    def session(self):
        if self._session is None:
            self._session = get_rembg_session(settings.rembg_model)
        return self._session
    
    async def process(self, image_data: bytes) -> bytes:
        """Process image to remove background"""
        try:
            # Run rembg in thread pool since it's CPU intensive
            result = await asyncio.get_running_loop().run_in_executor(
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
            output = remove(image_data, session=self.session)
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
