#!/usr/bin/env bash
# One-time setup for an Oracle Cloud Always Free Ubuntu VM (Ampere A1, arm64).
# Run from the repo checkout on the server:  ./deploy/oracle/setup.sh [hostname]
#
# Installs Docker, opens ports 80/443 in the VM's firewall, writes .env with a
# random RabbitMQ password, and starts the stack behind Caddy (HTTPS).
# Without a hostname it uses <public-ip>.sslip.io, which needs no DNS setup.
# Safe to re-run: it keeps an existing .env and just rebuilds and restarts.
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v docker >/dev/null 2>&1; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
fi

# Oracle's Ubuntu images reject everything but SSH in iptables, on top of the
# VCN security list (which you open in the Oracle console). Open 80/443 now and
# in the saved rules so they stay open after a reboot.
open_port() {
    local proto="$1" port="$2"
    if ! sudo iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null; then
        sudo iptables -I INPUT 1 -p "$proto" --dport "$port" -j ACCEPT
    fi
    local rules=/etc/iptables/rules.v4
    local rule="-A INPUT -p $proto -m $proto --dport $port -j ACCEPT"
    if [ -f "$rules" ] && ! sudo grep -qxF -- "$rule" "$rules"; then
        sudo sed -i "0,/^-A INPUT -j REJECT/s||$rule\n&|" "$rules"
    fi
}
open_port tcp 80
open_port tcp 443
open_port udp 443

if [ ! -f .env ]; then
    site="${1:-}"
    if [ -z "$site" ]; then
        ip="$(curl -fsS https://api.ipify.org)"
        site="${ip//./-}.sslip.io"
    fi
    cp .env.example .env
    sed -i "s|^RABBITMQ_DEFAULT_PASS=.*|RABBITMQ_DEFAULT_PASS=$(openssl rand -hex 24)|" .env
    echo "SITE_ADDRESS=$site" >> .env
    echo "Wrote .env for $site"
fi

# Unlocks the /api-keys page; added on re-runs too, for servers set up before it existed
if ! grep -q '^ADMIN_TOKEN=.' .env; then
    sed -i '/^#\? *ADMIN_TOKEN=/d' .env
    echo "ADMIN_TOKEN=$(openssl rand -hex 24)" >> .env
    echo "Added ADMIN_TOKEN to .env for the /api-keys page (read it with: grep ADMIN_TOKEN .env)"
fi

# The VM has 12 GB and no swap by default; building the worker image (PyTorch plus the
# models) next to the running site can use all of it and freeze the VM. Keep 8 GB of
# swap as headroom.
if [ "$(swapon --show=SIZE --bytes --noheadings | awk '{s+=$1} END {print s+0}')" -lt 4000000000 ]; then
    echo "Adding an 8 GB swap file..."
    if [ ! -f /swapfile ]; then
        sudo fallocate -l 8G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile >/dev/null
    fi
    sudo swapon /swapfile 2>/dev/null || true
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

compose() { sudo docker compose -f docker-compose.yml -f docker-compose.https.yml "$@"; }

# The models are baked into the backend image, so each rebuild needs room for a second
# copy of it. Trim the build cache to its most recent 5 GB (enough to skip reinstalling
# the Python packages when only code changed) and drop images nothing uses, so the
# 45 GB disk doesn't fill up. Images of the running containers are kept.
echo "Trimming Docker build cache and unused images..."
sudo docker builder prune -f --max-used-space 5gb >/dev/null 2>&1 \
    || sudo docker builder prune -f --keep-storage 5gb >/dev/null 2>&1 \
    || sudo docker builder prune -af >/dev/null
sudo docker image prune -f >/dev/null

# Build one image at a time (the API and worker share one backend image) while the
# old containers keep serving, then swap them over.
compose build api
compose build frontend
compose up -d
# Drop the images the new build replaced
sudo docker image prune -f >/dev/null

site="$(grep '^SITE_ADDRESS=' .env | cut -d= -f2-)"
echo
echo "Started. Open https://$site (the certificate can take a minute on first start)."
echo "Status: sudo docker compose -f docker-compose.yml -f docker-compose.https.yml ps"
