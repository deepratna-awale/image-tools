"""Download the models the CPU worker needs into U2NET_HOME (default ~/.u2net).

The Docker image runs this at build time; run it yourself once before starting the
worker outside Docker:

    cd backend && python deployment/fetch_models.py

Files that are already there are skipped. The model choices come from environment
variables (the Dockerfile's build args), with the same defaults:

    REMBG_MODEL      rembg model for background removal/changing (bria-rmbg)
    SKY_MODEL_URL    ADE20K segmentation ONNX for sky swap (SegFormer-b0)
    AI_SHIELD_VAES   "hf-repo:folder" pairs of Stable Diffusion VAEs for AI Shield
    UPSCALE_MODELS   "url=filename" pairs: Real-ESRGAN photo/anime and the CLIP picker

The GPU-only models (Florence-2, FLUX.1 Kontext, SDXL Inpainting) are fetched by
deployment/gpu/fetch_watermark_models.py for the GPU image instead.
"""
import os
import sys
import urllib.request

MODELS_DIR = os.environ.get("U2NET_HOME") or os.path.expanduser("~/.u2net")

REMBG_MODEL = os.environ.get("REMBG_MODEL") or "bria-rmbg"
SKY_MODEL_URL = os.environ.get("SKY_MODEL_URL") or (
    "https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx"
)
SKY_MODEL_PATH = os.environ.get("SKY_MODEL_PATH") or os.path.join(MODELS_DIR, "segformer-b0-ade.onnx")
AI_SHIELD_VAES = os.environ.get("AI_SHIELD_VAES") or (
    "stabilityai/sd-vae-ft-mse:sd-vae-ft-mse stabilityai/sdxl-vae:sdxl-vae"
)
UPSCALE_MODELS = os.environ.get("UPSCALE_MODELS") or (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth=RealESRGAN_x4plus.pth "
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth=RealESRGAN_x4plus_anime_6B.pth "
    "https://github.com/mlfoundations/open_clip/releases/download/v0.2-weights/vit_b_32-quickgelu-laion400m_e32-46683a32.pt=clip-vit-b-32-laion400m.pt"
)


def download(url: str, path: str) -> None:
    if os.path.exists(path):
        print(f"have  {path}")
        return
    print(f"fetch {url}")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp_path = f"{path}.part"
    urllib.request.urlretrieve(url, tmp_path)
    os.replace(tmp_path, path)


def main() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)

    # rembg downloads its own model into U2NET_HOME the first time a session is made
    print(f"rembg {REMBG_MODEL}")
    from rembg import new_session

    new_session(REMBG_MODEL)

    download(SKY_MODEL_URL, SKY_MODEL_PATH)

    for vae in AI_SHIELD_VAES.split():
        repo, folder = vae.split(":", 1)
        for name in ("config.json", "diffusion_pytorch_model.safetensors"):
            download(f"https://huggingface.co/{repo}/resolve/main/{name}", os.path.join(MODELS_DIR, folder, name))

    for model in UPSCALE_MODELS.split():
        url, name = model.rsplit("=", 1)
        download(url, os.path.join(MODELS_DIR, name))

    print(f"Models ready in {MODELS_DIR}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
