import logging
import os
import threading
import urllib.request

import cv2
import numpy as np
import onnxruntime as ort

from config.settings import settings

logger = logging.getLogger(__name__)

# ImageNet normalisation used by SegFormer and most ADE20K exports
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def ensure_model(path: str = None, url: str = None) -> str:
    """Download the segmentation model on first use (the Docker image bakes it in)"""
    path = path or settings.sky_model_path
    if not os.path.exists(path):
        url = url or settings.sky_model_url
        logger.info(f"Downloading sky segmentation model from {url}")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp_path = f"{path}.part"
        urllib.request.urlretrieve(url, tmp_path)
        os.replace(tmp_path, path)
    return path


class SkySegmenter:
    """Predicts, per pixel, how likely it is to be sky"""

    def __init__(self):
        self._session = None
        self._lock = threading.Lock()

    @property
    def session(self) -> ort.InferenceSession:
        with self._lock:
            if self._session is None:
                # CUDA on the GPU endpoint, CPU everywhere else
                providers = [
                    p for p in ("CUDAExecutionProvider", "CPUExecutionProvider")
                    if p in ort.get_available_providers()
                ]
                self._session = ort.InferenceSession(ensure_model(), providers=providers)
        return self._session

    def sky_probability(self, image: np.ndarray) -> np.ndarray:
        """Return an (H, W) float32 map in [0, 1] for an RGB uint8 image"""
        height, width = image.shape[:2]
        size = settings.sky_model_input_size

        resized = cv2.resize(image, (size, size), interpolation=cv2.INTER_LINEAR)
        pixels = (resized.astype(np.float32) / 255.0 - MEAN) / STD
        pixels = pixels.transpose(2, 0, 1)[np.newaxis]

        session = self.session
        logits = session.run(None, {session.get_inputs()[0].name: pixels})[0][0]

        # Softmax over classes, keep the sky channel
        logits = logits - logits.max(axis=0, keepdims=True)
        exp = np.exp(logits)
        sky = exp[settings.sky_class_index] / exp.sum(axis=0)

        return cv2.resize(sky.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
