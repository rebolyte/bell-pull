#!/bin/bash
set -euo pipefail

# To be run from local machine

IMAGE="ghcr.io/rebolyte/bell-pull:latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    echo "Error: .env file not found at $PROJECT_ROOT/.env"
    exit 1
fi

source "$PROJECT_ROOT/.env"


if [[ -z "${VPS_IP:-}" ]] || [[ -z "${VPS_USER:-}" ]]; then
    echo "Error: VPS_IP and VPS_USER must be set in .env"
    exit 1
fi

if [[ -n $(git status -s) ]]; then
    echo "Error: There are uncommitted changes in the working directory"
    echo "Please commit or stash your changes before deploying"
    exit 1
fi

# Build and push
docker build -t $IMAGE "$PROJECT_ROOT"
docker push $IMAGE

# Deploy on VPS
ssh -p ${VPS_SSH_PORT:-22} ${VPS_USER}@${VPS_IP} 'bash -s' < "$SCRIPT_DIR/restart-container.sh"

echo "Deployed!"
