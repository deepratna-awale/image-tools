# syntax=docker/dockerfile:1
# GPU endpoint for RunPod Serverless (see README.md next to this file).
# Build context: backend/
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive \
    U2NET_HOME=/opt/models \
    SKY_MODEL_PATH=/opt/models/segformer-b0-ade.onnx \
    NUMBA_CACHE_DIR=/tmp/numba_cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements/gpu.txt requirements/gpu.txt
# PyTorch built for the base image's CUDA (12.4) first: the default PyPI wheels need a
# newer driver than many RunPod hosts have, and a build for any other CUDA version picks
# up this image's libcudart and fails to load
RUN pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu124 \
    && pip3 install -r requirements/gpu.txt \
    && python3 -c "import torch; assert torch.version.cuda == '12.4', torch.version.cuda"

# Same models as the CPU image (backend/deployment/docker/Dockerfile), baked in so
# a cold start doesn't download them
ARG REMBG_MODEL=bria-rmbg
ARG SKY_MODEL_URL=https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx
ARG AI_SHIELD_VAES="stabilityai/sd-vae-ft-mse:sd-vae-ft-mse stabilityai/sdxl-vae:sdxl-vae"
# Upscaler: Real-ESRGAN photo and anime models (BSD-3-Clause) and the CLIP model that picks
# between them (open_clip ViT-B-32 trained on LAION-400M, MIT), as url=filename
ARG UPSCALE_MODELS="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth=RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth=RealESRGAN_x4plus_anime_6B.pth https://github.com/mlfoundations/open_clip/releases/download/v0.2-weights/vit_b_32-quickgelu-laion400m_e32-46683a32.pt=clip-vit-b-32-laion400m.pt"
RUN python3 -c "from rembg import new_session; new_session('${REMBG_MODEL}', providers=['CPUExecutionProvider'])" \
    && python3 -c "import urllib.request; urllib.request.urlretrieve('${SKY_MODEL_URL}', '${SKY_MODEL_PATH}')" \
    && for vae in ${AI_SHIELD_VAES}; do \
         repo="${vae%%:*}"; dir="/opt/models/${vae##*:}"; mkdir -p "$dir"; \
         for file in config.json diffusion_pytorch_model.safetensors; do \
           python3 -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
             "https://huggingface.co/${repo}/resolve/main/${file}" "${dir}/${file}"; \
         done; \
       done \
    && for model in ${UPSCALE_MODELS}; do \
         python3 -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
           "${model%%=*}" "/opt/models/${model##*=}"; \
       done

COPY config/ config/
COPY core/ core/
COPY services/ services/
COPY gpu_handler.py .

CMD ["python3", "-u", "gpu_handler.py"]
