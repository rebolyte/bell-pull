#!/bin/bash
set -euo pipefail

# To be run on server

IMAGE="ghcr.io/rebolyte/bell-pull:latest"
DATA_DIR=~/bell-pull-data

mkdir -p "$DATA_DIR"

if [[ ! -f "$DATA_DIR/.env" ]]; then
    echo "Error: .env file not found at $DATA_DIR/.env"
    echo "Create it with production values (see .env.example)"
    exit 1
fi

docker pull $IMAGE
docker stop bell-pull 2>/dev/null || true
docker rm bell-pull 2>/dev/null || true
docker run -d \
    --name bell-pull \
    -p 8000:8000 \
    -v "$DATA_DIR":/app/data \
    --env-file "$DATA_DIR/.env" \
    --restart unless-stopped \
    $IMAGE

echo "Container started"
