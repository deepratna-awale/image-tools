# syntax=docker/dockerfile:1
# Build context: backend/
FROM python:3.11-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    U2NET_HOME=/opt/models \
    NUMBA_CACHE_DIR=/tmp/numba_cache \
    LOCAL_STORAGE_PATH=/app/storage

RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

WORKDIR /app

COPY requirements/ requirements/
RUN pip install -r requirements/prod.txt

# Bake the background removal model into the image so workers don't
# download it on first job.
ARG REMBG_MODEL=bria-rmbg
# Sky segmentation model for sky swap (see sky_model_url in config/settings.py)
ARG SKY_MODEL_URL=https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx
ENV SKY_MODEL_PATH=/opt/models/segformer-b0-ade.onnx
# Stable Diffusion VAEs whose encoders AI Shield cloaks against (SD 1.x/2.x and SDXL, both MIT)
ARG AI_SHIELD_VAES="stabilityai/sd-vae-ft-mse:sd-vae-ft-mse stabilityai/sdxl-vae:sdxl-vae"
# Upscaler: Real-ESRGAN photo and anime models (BSD-3-Clause) and the CLIP model that picks
# between them (open_clip ViT-B-32 trained on LAION-400M, MIT), as url=filename
ARG UPSCALE_MODELS="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth=RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth=RealESRGAN_x4plus_anime_6B.pth https://github.com/mlfoundations/open_clip/releases/download/v0.2-weights/vit_b_32-quickgelu-laion400m_e32-46683a32.pt=clip-vit-b-32-laion400m.pt"
# Object eraser: Big LaMa (Apache-2.0), TorchScript build
ARG ERASER_MODEL_URL=https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt
# Old photo restorer: GFPGAN v1.4 (Apache-2.0), the YuNet face finder (MIT) and DDColor (Apache-2.0)
ARG RESTORE_MODELS="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth=GFPGANv1.4.pth https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx=face_detection_yunet_2023mar.onnx"
ARG COLORIZE_MODEL_REPO=piddnad/ddcolor_paper_tiny
# The build args reach the script as environment variables (same names)
COPY deployment/fetch_models.py deployment/fetch_models.py
RUN python deployment/fetch_models.py \
    && mkdir -p "$NUMBA_CACHE_DIR" \
    && chmod -R a+rX /opt/models \
    && chmod -R a+rwX "$NUMBA_CACHE_DIR"

# Development stage (source is bind-mounted by docker-compose)
FROM base AS development
RUN pip install -r requirements/dev.txt
RUN mkdir -p /app/storage && chown appuser:appuser /app/storage
USER appuser

# Production stage
FROM base AS production

COPY --chown=appuser:appuser . .
RUN mkdir -p /app/storage && chown appuser:appuser /app/storage

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# API by default; the worker overrides this with `python -m workers.image_processor`
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
