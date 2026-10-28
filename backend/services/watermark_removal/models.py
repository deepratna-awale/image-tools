"""The LaMa inpainting model. Imports torch, so only the worker loads this module."""

import logging
import threading

import numpy as np
import torch

from config.settings import settings

logger = logging.getLogger(__name__)

# LaMa downsamples by 8, so inputs are padded to a multiple of it
MODULO = 8


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


class Inpainter:
    """big-lama (TorchScript): fills masked pixels from their surroundings"""

    def __init__(self, path: str):
        self.device = _device()
        self.model = torch.jit.load(path, map_location="cpu").eval().to(self.device)

    @torch.inference_mode()
    def inpaint(self, rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """RGB uint8 (h, w, 3) and a mask (h, w) that is non-zero where to fill; RGB uint8 out"""
        height, width = mask.shape
        pad_h, pad_w = -height % MODULO, -width % MODULO
        rgb = np.pad(rgb, ((0, pad_h), (0, pad_w), (0, 0)), mode="symmetric")
        mask = np.pad(mask, ((0, pad_h), (0, pad_w)), mode="symmetric")
        image = torch.from_numpy(rgb).permute(2, 0, 1)[None].float().div_(255).to(self.device)
        holes = torch.from_numpy((mask > 0).astype(np.float32))[None, None].to(self.device)
        result = self.model(image, holes)[0]
        result = result.clamp_(0, 1).mul_(255).round_().byte().permute(1, 2, 0).cpu().numpy()
        return result[:height, :width]


_lock = threading.Lock()
_model = None


def get_model() -> Inpainter:
    """Load the model once per process"""
    global _model
    with _lock:
        if _model is None:
            logger.info("Loading inpainting model")
            _model = Inpainter(settings.watermark_model_path)
        return _model


def on_gpu() -> bool:
    return torch.cuda.is_available()
