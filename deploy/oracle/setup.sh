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

sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build

site="$(grep '^SITE_ADDRESS=' .env | cut -d= -f2-)"
echo
echo "Started. Open https://$site (the certificate can take a minute on first start)."
echo "Status: sudo docker compose -f docker-compose.yml -f docker-compose.https.yml ps"
