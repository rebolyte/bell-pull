#!/bin/bash
set -euo pipefail

# To be run on server

IMAGE="ghcr.io/rebolyte/bell-pull:latest"

# TODO reference the .env file in the VPS
# TODO mount DB file
# TODO initial startup, not just restart
docker pull $IMAGE
docker stop myapp || true
docker rm myapp || true
docker run -d \
    --name myapp \
    -p 8000:8000 \
    --env-file ~/.env \
    --restart unless-stopped \
    $IMAGE

echo "Container restarted"
