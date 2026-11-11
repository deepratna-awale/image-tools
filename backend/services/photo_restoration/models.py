"""Face restoration (GFPGAN) and colorization (DDColor). Imports torch, so only the worker
loads this module."""

import glob
import logging
import os
import threading
from typing import List, Optional

import cv2
import numpy as np
import torch

from config.settings import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_models = {}

# Where GFPGAN expects the eyes, nose tip and mouth corners in its 512x512 input (FFHQ)
FACE_TEMPLATE = np.array(
    [[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935], [201.26117, 371.41043], [313.08905, 371.15118]],
    dtype=np.float32,
)
FACE_SIZE = 512


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _fetch(path: str, url: str) -> str:
    """The Docker image bakes the models in; a worker run by hand fetches them once"""
    if not os.path.exists(path):
        logger.info(f"Downloading {url} to {path}")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        torch.hub.download_url_to_file(url, path)
    return path


def _fetch_colorizer() -> str:
    """DDColor's weights from its Hugging Face repo, whatever the weights file is called"""
    folder = settings.colorize_model_path
    found = [f for ext in ("safetensors", "bin", "pt", "pth") for f in glob.glob(os.path.join(folder, f"*.{ext}"))]
    if not found:
        from huggingface_hub import snapshot_download

        logger.info(f"Downloading {settings.colorize_model_repo} to {folder}")
        snapshot_download(settings.colorize_model_repo, local_dir=folder)
        found = [f for ext in ("safetensors", "bin", "pt", "pth") for f in glob.glob(os.path.join(folder, f"*.{ext}"))]
    if not found:
        raise RuntimeError(f"No weights found in {folder}")
    return found[0]


class FaceRestorer:
    """Finds faces with YuNet (MIT) and redraws each with GFPGAN v1.4 (Apache-2.0)"""

    def __init__(self):
        import spandrel

        self.device = _device()
        descriptor = spandrel.ModelLoader().load_from_file(_fetch(settings.restore_face_model_path, settings.restore_face_model_url))
        self.model = descriptor.model.eval().to(self.device)
        self.detector_path = _fetch(settings.restore_face_detector_path, settings.restore_face_detector_url)

    def find(self, bgr: np.ndarray) -> List[np.ndarray]:
        """The five landmarks (eyes, nose, mouth corners; image-left first) of every face"""
        height, width = bgr.shape[:2]
        # YuNet finds faces down to about 10 px; very large inputs are scaled down to find them
        scale = min(1.0, 1600 / max(width, height))
        small = cv2.resize(bgr, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else bgr
        detector = cv2.FaceDetectorYN.create(self.detector_path, "", (small.shape[1], small.shape[0]), 0.7, 0.3, 5000)
        _, faces = detector.detect(small)
        if faces is None:
            return []
        found = []
        for face in faces:
            points = face[4:14].reshape(5, 2) / scale
            # Smaller than this, there is nothing for GFPGAN to work from
            if face[2] / scale < 24:
                continue
            found.append(points.astype(np.float32))
        return found

    @torch.inference_mode()
    def restore(self, rgb: np.ndarray, strength: float = 1.0) -> tuple[np.ndarray, int]:
        """Returns the image with every face restored, and how many faces there were"""
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        faces = self.find(bgr)
        result = rgb.astype(np.float32)
        height, width = rgb.shape[:2]
        for points in faces:
            matrix, _ = cv2.estimateAffinePartial2D(points, FACE_TEMPLATE, method=cv2.LMEDS)
            if matrix is None:
                continue
            crop = cv2.warpAffine(rgb, matrix, (FACE_SIZE, FACE_SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            tensor = torch.from_numpy(crop).permute(2, 0, 1)[None].float().div(255).mul(2).sub(1).to(self.device)
            output = self.model(tensor, return_rgb=False)[0][0]
            face = output.clamp(-1, 1).add(1).div(2).mul(255).permute(1, 2, 0).cpu().numpy()
            if strength < 1:
                face = crop * (1 - strength) + face * strength

            inverse = cv2.invertAffineTransform(matrix)
            back = cv2.warpAffine(face, inverse, (width, height), flags=cv2.INTER_LINEAR)
            # Blend in with a soft-edged mask so no seam shows round the face
            mask = np.zeros((FACE_SIZE, FACE_SIZE), np.float32)
            cv2.rectangle(mask, (24, 24), (FACE_SIZE - 25, FACE_SIZE - 25), 1.0, -1)
            mask = cv2.GaussianBlur(mask, (0, 0), 14)
            weight = cv2.warpAffine(mask, inverse, (width, height), flags=cv2.INTER_LINEAR)[..., None]
            result = result * (1 - weight) + back * weight
        return np.clip(result.round(), 0, 255).astype(np.uint8), len(faces)


class Colorizer:
    """DDColor (Apache-2.0): colours a black and white photo, keeping its original light and detail"""

    def __init__(self):
        import spandrel
        import spandrel_extra_arches

        spandrel_extra_arches.install(ignore_duplicates=True)
        self.device = _device()
        self.descriptor = spandrel.ModelLoader().load_from_file(_fetch_colorizer())
        self.descriptor.model.eval().to(self.device)

    @torch.inference_mode()
    def colorize(self, rgb: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        tensor = torch.from_numpy(gray)[None, None].float().div(255).to(self.device)
        output = self.descriptor(tensor)[0]
        return output.clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).cpu().numpy()


def _get(name: str, factory):
    with _lock:
        if name not in _models:
            _models[name] = factory()
            logger.info(f"Loaded the {name} model")
        return _models[name]


def get_restorer() -> FaceRestorer:
    return _get("face restoration", FaceRestorer)


def get_colorizer() -> Colorizer:
    return _get("colorization", Colorizer)


def is_grayscale(rgb: np.ndarray) -> bool:
    """True for black and white photos, including toned ones (sepia, cyanotype)"""
    small = cv2.resize(rgb, (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32)
    lab = cv2.cvtColor(small / 255, cv2.COLOR_RGB2Lab)
    chroma = float(np.hypot(lab[..., 1], lab[..., 2]).mean())
    # A tone shifts every pixel the same modest way; real colour varies from place to place
    spread = float(np.std(lab[..., 1]) + np.std(lab[..., 2]))
    return chroma < 4 or (chroma < 30 and spread < 10)
