"""The upscaling and style models. Imports torch, so only the worker loads this module."""

import logging
import threading

import numpy as np
import torch
from PIL import Image

from config.settings import settings

logger = logging.getLogger(__name__)

# Input tiles keep memory flat for large images; the padding hides the seams
TILE = 384
TILE_PAD = 16
# Text prompts the style check compares an image against (CLIP zero-shot)
STYLE_PROMPTS = {
    "anime": ["an anime illustration", "a manga drawing", "a cartoon", "a digital painting", "anime screenshot"],
    "photo": ["a photo", "a photograph of a person", "a photograph of a landscape", "a realistic photo", "a selfie"],
}
CLIP_ARCH = "ViT-B-32-quickgelu"


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


class Upscaler:
    """One Real-ESRGAN x4 model, run tile by tile"""

    def __init__(self, path: str):
        import spandrel

        self.device = _device()
        descriptor = spandrel.ModelLoader().load_from_file(path)
        self.scale = descriptor.scale
        # Half precision is about twice as fast on a GPU and looks the same
        self.half = self.device.type == "cuda" and descriptor.supports_half
        self.model = descriptor.model.eval().to(self.device)
        if self.half:
            self.model = self.model.half()

    @torch.inference_mode()
    def upscale(self, rgb: np.ndarray) -> np.ndarray:
        """RGB uint8 (h, w, 3) in, RGB uint8 (h * scale, w * scale, 3) out"""
        height, width = rgb.shape[:2]
        scale = self.scale
        output = np.empty((height * scale, width * scale, 3), dtype=np.uint8)
        source = torch.from_numpy(rgb.copy()).permute(2, 0, 1)[None]
        for top in range(0, height, TILE):
            for left in range(0, width, TILE):
                bottom, right = min(top + TILE, height), min(left + TILE, width)
                pad_top, pad_left = max(top - TILE_PAD, 0), max(left - TILE_PAD, 0)
                pad_bottom, pad_right = min(bottom + TILE_PAD, height), min(right + TILE_PAD, width)
                tile = source[:, :, pad_top:pad_bottom, pad_left:pad_right].to(self.device)
                tile = (tile.half() if self.half else tile.float()) / 255.0
                result = self.model(tile)[0].float().clamp_(0, 1).mul_(255).round_().byte()
                result = result[
                    :,
                    (top - pad_top) * scale:(bottom - pad_top) * scale,
                    (left - pad_left) * scale:(right - pad_left) * scale,
                ]
                output[top * scale:bottom * scale, left * scale:right * scale] = result.permute(1, 2, 0).cpu().numpy()
        return output


class StyleClassifier:
    """Tells anime, cartoons and digital art apart from photos with CLIP"""

    def __init__(self, path: str):
        import open_clip

        self.device = _device()
        model, _, self.preprocess = open_clip.create_model_and_transforms(CLIP_ARCH, pretrained=path)
        model = model.eval().to(self.device)
        tokenizer = open_clip.get_tokenizer(CLIP_ARCH)
        with torch.inference_mode():
            labels = []
            for prompts in STYLE_PROMPTS.values():
                features = model.encode_text(tokenizer(prompts).to(self.device))
                features = features / features.norm(dim=-1, keepdim=True)
                mean = features.mean(dim=0)
                labels.append(mean / mean.norm())
        self.labels = torch.stack(labels)
        self.names = list(STYLE_PROMPTS)
        self.model = model

    @torch.inference_mode()
    def anime_probability(self, rgb: np.ndarray) -> float:
        image = self.preprocess(Image.fromarray(rgb))[None].to(self.device)
        features = self.model.encode_image(image)
        features = features / features.norm(dim=-1, keepdim=True)
        probabilities = (100.0 * features @ self.labels.T).softmax(dim=-1)[0]
        return float(probabilities[self.names.index("anime")])


_lock = threading.Lock()
_models: dict = {}


def get_model(name: str):
    """Load each model (photo, anime or style) once per process"""
    with _lock:
        if name not in _models:
            logger.info(f"Loading upscaling model: {name}")
            if name == "style":
                _models[name] = StyleClassifier(settings.upscale_style_model_path)
            else:
                path = settings.upscale_anime_model_path if name == "anime" else settings.upscale_photo_model_path
                _models[name] = Upscaler(path)
        return _models[name]


def on_gpu() -> bool:
    return torch.cuda.is_available()
