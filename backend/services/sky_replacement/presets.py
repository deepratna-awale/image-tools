from functools import lru_cache

import cv2
import numpy as np

# Gradient stops from the top of the sky (0.0) down to the horizon (1.0), RGB
PRESETS = {
    "clear": [(0.0, (38, 94, 168)), (0.55, (88, 150, 214)), (1.0, (190, 218, 240))],
    "sunset": [(0.0, (44, 52, 110)), (0.45, (196, 92, 96)), (0.8, (244, 152, 80)), (1.0, (252, 208, 132))],
    "dusk": [(0.0, (18, 26, 64)), (0.5, (86, 70, 128)), (0.85, (214, 128, 140)), (1.0, (246, 186, 160))],
    "golden": [(0.0, (70, 120, 180)), (0.5, (196, 178, 160)), (0.85, (240, 196, 120)), (1.0, (255, 224, 160))],
}
# How strongly clouds show in each preset
CLOUDS = {"clear": 0.55, "sunset": 0.35, "dusk": 0.25, "golden": 0.4}

RENDER_WIDTH = 1920
RENDER_HEIGHT = 1080


def _gradient(stops, height: int, width: int) -> np.ndarray:
    positions = np.linspace(0.0, 1.0, height)
    xs = [s[0] for s in stops]
    column = np.stack(
        [np.interp(positions, xs, [s[1][c] for s in stops]) for c in range(3)], axis=-1
    )
    return np.repeat(column[:, np.newaxis, :], width, axis=1).astype(np.float32)


def _clouds(height: int, width: int, seed: int) -> np.ndarray:
    """Soft fractal noise, stretched horizontally like stratus clouds"""
    rng = np.random.default_rng(seed)
    noise = np.zeros((height, width), dtype=np.float32)
    amplitude, total = 1.0, 0.0
    for octave in range(6):
        cells_x, cells_y = 3 * 2 ** octave, 2 * 2 ** octave
        layer = rng.random((cells_y, cells_x)).astype(np.float32)
        noise += amplitude * cv2.resize(layer, (width, height), interpolation=cv2.INTER_CUBIC)
        total += amplitude
        amplitude *= 0.5
    noise /= total
    # Keep only the brighter blobs so there is open sky between clouds
    return np.clip((noise - 0.5) * 3.0, 0.0, 1.0)


@lru_cache(maxsize=None)
def render_preset(name: str) -> np.ndarray:
    """Render a preset sky as an RGB uint8 image"""
    if name not in PRESETS:
        raise ValueError(f"Unknown sky preset: {name}")
    sky = _gradient(PRESETS[name], RENDER_HEIGHT, RENDER_WIDTH)
    clouds = _clouds(RENDER_HEIGHT, RENDER_WIDTH, seed=sorted(PRESETS).index(name))
    # Clouds fade out towards the horizon and pick up a little of the sky's warmth
    fade = np.linspace(1.0, 0.4, RENDER_HEIGHT, dtype=np.float32)[:, np.newaxis]
    weight = (clouds * fade * CLOUDS[name])[..., np.newaxis]
    cloud_color = 0.75 * 255.0 + 0.25 * sky
    sky = sky * (1.0 - weight) + cloud_color * weight
    return np.clip(sky, 0, 255).astype(np.uint8)
