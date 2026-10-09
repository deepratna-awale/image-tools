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
ARG REMBG_MODEL=u2net
# Sky segmentation model for sky swap (see sky_model_url in config/settings.py)
ARG SKY_MODEL_URL=https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx
ENV SKY_MODEL_PATH=/opt/models/segformer-b0-ade.onnx
# Stable Diffusion VAEs whose encoders AI Shield cloaks against (SD 1.x/2.x and SDXL, both MIT)
ARG AI_SHIELD_VAES="stabilityai/sd-vae-ft-mse:sd-vae-ft-mse stabilityai/sdxl-vae:sdxl-vae"
RUN python -c "from rembg import new_session; new_session('${REMBG_MODEL}')" \
    && python -c "import urllib.request; urllib.request.urlretrieve('${SKY_MODEL_URL}', '${SKY_MODEL_PATH}')" \
    && for vae in ${AI_SHIELD_VAES}; do \
         repo="${vae%%:*}"; dir="/opt/models/${vae##*:}"; mkdir -p "$dir"; \
         for file in config.json diffusion_pytorch_model.safetensors; do \
           python -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
             "https://huggingface.co/${repo}/resolve/main/${file}" "${dir}/${file}"; \
         done; \
       done \
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
