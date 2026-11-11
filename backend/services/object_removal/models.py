"""The LaMa inpainting model. Imports torch, so only the worker loads this module."""

import logging
import os
import threading

import numpy as np
import torch

from config.settings import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_eraser = None


class Eraser:
    """Big LaMa (Apache-2.0), TorchScript build: fills holes from the surrounding image.
    Fast enough for the CPU at around a megapixel, and it doesn't invent new objects."""

    multiple = 8

    def __init__(self, path: str):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = torch.jit.load(path, map_location=self.device).eval()

    @torch.inference_mode()
    def fill(self, rgb: np.ndarray, holes: np.ndarray) -> np.ndarray:
        """RGB uint8 (h, w, 3) and a boolean (h, w) mask in; RGB uint8 (h, w, 3) out"""
        height, width = rgb.shape[:2]
        # The network needs sides that are a multiple of 8; mirror the edges to get there
        pad_h, pad_w = -height % self.multiple, -width % self.multiple
        rgb = np.pad(rgb, ((0, pad_h), (0, pad_w), (0, 0)), mode="symmetric")
        holes = np.pad(holes, ((0, pad_h), (0, pad_w)), mode="symmetric")
        image = torch.from_numpy(np.ascontiguousarray(rgb)).permute(2, 0, 1)[None].float().div_(255).to(self.device)
        mask = torch.from_numpy(holes.astype(np.float32))[None, None].to(self.device)
        result = self.model(image, mask)[0].permute(1, 2, 0).clamp_(0, 1).mul_(255).round_().byte().cpu().numpy()
        return result[:height, :width]


def get_eraser() -> Eraser:
    global _eraser
    with _lock:
        if _eraser is None:
            path = settings.eraser_model_path
            if not os.path.exists(path):
                # The Docker images bake it in; a worker run by hand fetches it once
                logger.info(f"Downloading the eraser model to {path}")
                os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
                torch.hub.download_url_to_file(settings.eraser_model_url, path)
            _eraser = Eraser(path)
            logger.info(f"Loaded the eraser model on {_eraser.device}")
        return _eraser
