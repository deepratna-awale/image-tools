"""Adversarial cloak against Stable Diffusion's image encoder.

Latent diffusion models never look at pixels directly: training, fine-tuning
(DreamBooth, LoRA, textual inversion) and img2img all start by running the
image through the model's VAE encoder. Following PhotoGuard's encoder attack
and Mist's textural loss, this adds a small, bounded perturbation that makes
the encoder map the picture close to the latent of an unrelated, high-contrast
"NO AI" pattern, so models that learn from or edit the image pick up that
pattern instead of the artwork.

The perturbation is optimised against the SD 1.x/2.x and SDXL encoders
(alternating between them), at a reduced working size to fit on a CPU, then
scaled up to the original resolution. It is a deterrent, not a guarantee:
other model families, heavy re-compression, upscaling with noise or
purification tricks can weaken or remove it.
"""

import logging
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Strength:
    # Long side, in pixels, the perturbation is optimised at
    work_size: int
    steps: int
    # Largest change to any colour channel, out of 255, in busy parts of the image
    epsilon: int


STRENGTHS: Dict[str, Strength] = {
    "low": Strength(work_size=320, steps=12, epsilon=4),
    "medium": Strength(work_size=384, steps=20, epsilon=8),
    "high": Strength(work_size=448, steps=28, epsilon=12),
}
DEFAULT_STRENGTH = "medium"

# Flat areas (sky, skin, gradients) get this share of the budget; noise shows most there
FLAT_AREA_BUDGET = 0.2


def texture_mask(rgb: np.ndarray) -> np.ndarray:
    """Per-pixel share of the budget in [FLAT_AREA_BUDGET, 1]: more where the image is busy.

    A rough stand-in for the perceptual constraint Glaze uses, so the cloak hides in texture.
    """
    import cv2

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    radius = max(2, round(max(gray.shape) / 200))
    size = (2 * radius + 1, 2 * radius + 1)
    mean = cv2.boxFilter(gray, -1, size)
    std = np.sqrt(np.maximum(cv2.boxFilter(gray * gray, -1, size) - mean * mean, 0.0))
    scale = float(np.percentile(std, 90)) or 1.0
    busy = np.clip(std / scale, 0.0, 1.0)
    busy = cv2.GaussianBlur(busy, (0, 0), radius)
    return FLAT_AREA_BUDGET + (1.0 - FLAT_AREA_BUDGET) * busy


def target_pattern(width: int, height: int, seed: int = 7) -> np.ndarray:
    """High-contrast tiled pattern the encoder is pushed towards"""
    rng = np.random.default_rng(seed)
    image = Image.new("RGB", (width, height), (250, 250, 250))
    draw = ImageDraw.Draw(image)
    cell = max(24, min(width, height) // 6)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", cell // 4)
    except OSError:
        font = ImageFont.load_default()
    colors = [(230, 30, 40), (20, 20, 20), (30, 60, 220), (250, 200, 0)]
    for row, y in enumerate(range(-cell, height + cell, cell)):
        for column, x in enumerate(range(-cell, width + cell, cell)):
            color = colors[(row + column) % len(colors)]
            shift = int(rng.integers(0, cell // 4 + 1))
            if (row + column) % 2:
                for offset in range(0, cell, max(4, cell // 8)):
                    draw.line([(x + offset, y + shift), (x + offset + cell // 2, y + cell + shift)], fill=color, width=3)
            else:
                draw.ellipse([x + shift, y + shift, x + cell - shift, y + cell - shift], outline=color, width=max(3, cell // 10))
                draw.text((x + cell // 5, y + cell // 3), "NO AI", fill=color, font=font)
    return np.asarray(image)


def _to_tensor(rgb: np.ndarray) -> torch.Tensor:
    return torch.from_numpy(np.array(rgb, dtype=np.float32)).permute(2, 0, 1).unsqueeze(0) / 255.0


def _work_dims(width: int, height: int, work_size: int) -> Tuple[int, int]:
    """Working size: long side at most work_size, both sides multiples of 8 (the VAE downsamples by 8)"""
    scale = min(1.0, work_size / max(width, height))
    return max(64, round(width * scale / 8) * 8), max(64, round(height * scale / 8) * 8)


def _gaussian_blur(x: torch.Tensor, sigma: float) -> torch.Tensor:
    """Differentiable blur, so the cloak also survives mild softening and resizing"""
    radius = max(1, int(round(sigma * 2)))
    coords = torch.arange(-radius, radius + 1, dtype=x.dtype, device=x.device)
    kernel = torch.exp(-(coords**2) / (2 * sigma**2))
    kernel = kernel / kernel.sum()
    channels = x.shape[1]
    horizontal = kernel.view(1, 1, 1, -1).repeat(channels, 1, 1, 1)
    vertical = kernel.view(1, 1, -1, 1).repeat(channels, 1, 1, 1)
    x = F.conv2d(F.pad(x, (radius, radius, 0, 0), mode="reflect"), horizontal, groups=channels)
    return F.conv2d(F.pad(x, (0, 0, radius, radius), mode="reflect"), vertical, groups=channels)


class LatentEncoders:
    """The VAE encoders (image -> latent mean) of the Stable Diffusion families the cloak targets"""

    def __init__(self, encoders: Sequence[torch.nn.Module]):
        if not encoders:
            raise ValueError("At least one encoder is needed")
        self.encoders = list(encoders)
        self.device = next(self.encoders[0].parameters(), torch.empty(0)).device
        for encoder in self.encoders:
            encoder.eval()
            for parameter in encoder.parameters():
                parameter.requires_grad_(False)

    @classmethod
    def from_dirs(cls, model_dirs: Sequence[str]) -> "LatentEncoders":
        from diffusers import AutoencoderKL

        device = "cuda" if torch.cuda.is_available() else "cpu"
        encoders = []
        for model_dir in model_dirs:
            vae = AutoencoderKL.from_pretrained(model_dir, torch_dtype=torch.float32)
            # Only the encoder is used; drop the decoder to save memory
            vae.decoder = torch.nn.Identity()
            vae.post_quant_conv = torch.nn.Identity()
            encoders.append(VaeEncoder(vae).to(device))
        return cls(encoders)

    def __len__(self) -> int:
        return len(self.encoders)

    def encode(self, index: int, image: torch.Tensor) -> torch.Tensor:
        """Latent mean for an image batch in [0, 1]"""
        return self.encoders[index](image)


class VaeEncoder(torch.nn.Module):
    """Wraps a diffusers AutoencoderKL to return the latent mean for [0, 1] images"""

    def __init__(self, vae):
        super().__init__()
        self.vae = vae

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        return self.vae.encode(image * 2.0 - 1.0).latent_dist.mean


@dataclass
class CloakResult:
    image: np.ndarray
    # How far the cloak moved each encoder's latent, relative to the clean image's distance from the target
    target_gap_before: List[float]
    target_gap_after: List[float]


def cloak(
    rgb: np.ndarray,
    encoders: LatentEncoders,
    strength: Strength,
    seed: int = 0,
) -> CloakResult:
    """Return a cloaked copy of an RGB uint8 image"""
    generator = torch.Generator().manual_seed(seed)
    height, width = rgb.shape[:2]
    work_w, work_h = _work_dims(width, height, strength.work_size)

    device = encoders.device

    work_rgb = np.asarray(Image.fromarray(rgb).resize((work_w, work_h), Image.Resampling.LANCZOS))
    x = _to_tensor(work_rgb).to(device)
    epsilon = strength.epsilon / 255.0
    budget = epsilon * torch.from_numpy(texture_mask(work_rgb)).float()[None, None].to(device)
    target = _to_tensor(target_pattern(work_w, work_h)).to(device)

    with torch.no_grad():
        target_latents = [encoders.encode(i, target) for i in range(len(encoders))]
        gap_before = [F.mse_loss(encoders.encode(i, x), target_latents[i]).item() for i in range(len(encoders))]

    # Projected gradient descent with signed steps (PGD), starting from small random noise
    step_size = 2.5 * epsilon / strength.steps
    # Random draws stay on the CPU generator so a seed gives the same cloak on any device
    delta = (torch.rand(x.shape, generator=generator).to(device) * 2 - 1) * budget * 0.5
    for step in range(strength.steps):
        index = step % len(encoders)
        delta.requires_grad_(True)
        candidate = (x + delta).clamp(0, 1)
        if step % 2:
            sigma = 0.5 + 0.7 * torch.rand(1, generator=generator).item()
            candidate = _gaussian_blur(candidate, sigma)
        loss = F.mse_loss(encoders.encode(index, candidate), target_latents[index])
        (gradient,) = torch.autograd.grad(loss, delta)
        with torch.no_grad():
            delta = delta - step_size * gradient.sign()
            delta = torch.maximum(torch.minimum(delta, budget), -budget)
            delta = (x + delta).clamp(0, 1) - x
        logger.debug(f"Cloak step {step + 1}/{strength.steps}: loss {loss.item():.4f}")

    with torch.no_grad():
        gap_after = [F.mse_loss(encoders.encode(i, x + delta), target_latents[i]).item() for i in range(len(encoders))]

        # Scale the perturbation up to the full image and keep it inside the full-size budget
        full = _to_tensor(rgb).to(device)
        full_budget = epsilon * torch.from_numpy(texture_mask(rgb)).float()[None, None].to(device)
        delta_full = F.interpolate(delta, size=(height, width), mode="bicubic", align_corners=False)
        delta_full = torch.maximum(torch.minimum(delta_full, full_budget), -full_budget)
        cloaked = (full + delta_full).clamp(0, 1)
        result = (cloaked[0].permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)

    return CloakResult(result, gap_before, gap_after)


class EncoderCache:
    """Loads the encoders once per worker process, on first use"""

    def __init__(self, model_dirs: Optional[Sequence[str]] = None):
        self.model_dirs = model_dirs
        self._encoders: Optional[LatentEncoders] = None
        self._lock = threading.Lock()

    def get(self) -> LatentEncoders:
        with self._lock:
            if self._encoders is None:
                import os

                from config.settings import settings

                model_dirs = self.model_dirs or settings.ai_shield_model_dir_list
                missing = [d for d in model_dirs if not os.path.isfile(os.path.join(d, "config.json"))]
                if missing:
                    raise RuntimeError(f"AI Shield models are not installed: {', '.join(missing)}")
                if settings.ai_shield_threads > 0:
                    torch.set_num_threads(settings.ai_shield_threads)
                self._encoders = LatentEncoders.from_dirs(model_dirs)
                logger.info(f"Loaded {len(self._encoders)} encoders for AI Shield")
        return self._encoders
