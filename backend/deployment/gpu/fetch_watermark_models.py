"""Downloads the watermark remover's models into the GPU image (see the Dockerfile).

Usage: fetch_watermark_models.py flux|sdxl <models dir>. Reads HF_TOKEN for gated models.
"""

import os
import sys

from huggingface_hub import snapshot_download

fill_model, models_dir = sys.argv[1], sys.argv[2]
token = os.environ.get("HF_TOKEN") or None


def fetch(repo: str, folder: str, patterns) -> None:
    print(f"Downloading {repo} into {folder}", flush=True)
    snapshot_download(repo, local_dir=os.path.join(models_dir, folder), allow_patterns=patterns, token=token)


CONFIGS = ["*.json", "*.txt", "*.model", "tokenizer*/*"]

fetch("florence-community/Florence-2-large", "florence-2-large", CONFIGS + ["*.safetensors"])
if fill_model == "flux":
    if not token:
        sys.exit("FLUX.1 Kontext is gated: build with an hf_token secret (see deployment/gpu/README.md)")
    fetch(
        "black-forest-labs/FLUX.1-Kontext-dev",
        "flux-kontext",
        CONFIGS + ["transformer/*.safetensors", "text_encoder/*.safetensors", "text_encoder_2/*.safetensors", "vae/*.safetensors"],
    )
elif fill_model == "sdxl":
    fetch(
        "diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
        "sdxl-inpaint",
        CONFIGS + ["unet/*.fp16.safetensors", "text_encoder*/*.fp16.safetensors"],
    )
    fetch("madebyollin/sdxl-vae-fp16-fix", "sdxl-inpaint/vae-fp16-fix", ["config.json", "diffusion_pytorch_model.safetensors"])
else:
    sys.exit(f"Unknown fill model: {fill_model}")
