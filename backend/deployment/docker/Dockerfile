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
RUN python -c "from rembg import new_session; new_session('${REMBG_MODEL}')" \
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
