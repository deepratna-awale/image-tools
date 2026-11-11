#!/usr/bin/env bash
# Run Image Tools on your own machine (Linux, macOS or Windows WSL) with Docker.
#   ./deploy/local/setup.sh
#
# Writes .env with a random RabbitMQ password and admin token the first time,
# builds the images (the first build downloads about 2 GB of models and takes
# 10-20 minutes), starts the stack and waits until the site answers.
# Safe to re-run: it keeps an existing .env and just rebuilds and restarts,
# which is also how you update after a `git pull`.
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. Get Docker Desktop (macOS/Windows) or Docker Engine (Linux):"
    echo "  https://docs.docker.com/get-docker/"
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is missing ('docker compose ...'). Update Docker, or install the compose plugin."
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but not running (or needs sudo). Start Docker Desktop / the docker service and try again."
    exit 1
fi

random_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 24
    else
        LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 48
    fi
}

# Set KEY=value in .env, replacing an existing (or commented-out) line.
# Written with awk rather than `sed -i`, which differs between macOS and Linux.
set_env() {
    local key="$1" value="$2" tmp
    tmp="$(mktemp)"
    awk -v key="$key" -v value="$value" '
        $0 ~ "^#? *" key "=" { if (!done) print key "=" value; done = 1; next }
        { print }
        END { if (!done) print key "=" value }
    ' .env >"$tmp"
    mv "$tmp" .env
}

if [ ! -f .env ]; then
    cp .env.example .env
    set_env RABBITMQ_DEFAULT_PASS "$(random_secret)"
    set_env ADMIN_TOKEN "$(random_secret)"
    echo "Wrote .env with a random RabbitMQ password and admin token."
elif ! grep -q '^RABBITMQ_DEFAULT_PASS=.' .env; then
    set_env RABBITMQ_DEFAULT_PASS "$(random_secret)"
    echo "Added a RabbitMQ password to .env."
fi

port="$(grep -E '^FRONTEND_PORT=' .env | cut -d= -f2- || true)"
port="${port:-3000}"

echo "Building and starting (the first build takes 10-20 minutes)..."
docker compose up -d --build

echo -n "Waiting for the site to answer on port $port"
for _ in $(seq 1 90); do
    if curl -fsS "http://localhost:$port/api/health" >/dev/null 2>&1; then
        echo
        echo
        echo "Image Tools is running at http://localhost:$port"
        if grep -q '^RUNPOD_API_KEY=.' .env && grep -q '^RUNPOD_ENDPOINT_ID=.' .env; then
            echo "AI tools send model work to your RunPod GPU endpoint (CPU fallback)."
        else
            echo "AI tools run on this machine's CPU. Watermark Remover and Outpainting need a GPU"
            echo "endpoint; see docs/SELF_HOSTING.md#optional-gpu-runpod-serverless."
        fi
        echo "API keys page: http://localhost:$port/api-keys (admin token: grep ADMIN_TOKEN .env)"
        echo "Logs: docker compose logs -f worker    Stop: docker compose down"
        exit 0
    fi
    echo -n "."
    sleep 2
done
echo
echo "The site didn't answer within 3 minutes. Check: docker compose ps && docker compose logs --tail 50"
exit 1
