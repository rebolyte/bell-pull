#!/bin/bash
set -euo pipefail

# To be run from local machine

# TODO get VPS IP and SSH port from .env (don't want to commit this)
IMAGE="ghcr.io/rebolyte/bell-pull:latest"
VPS="user@your-vps-ip"
SSH_PORT=22

if [[ -n $(git status -s) ]]; then
    echo "Error: There are uncommitted changes in the working directory"
    echo "Please commit or stash your changes before deploying"
    exit 1
fi

# Build and push
docker build -t $IMAGE .
docker push $IMAGE

# Deploy on VPS

# ssh -p $PORT root@1.2.3.4 "unzip $APP_PATH/artifact.zip -d $APP_PATH && $APP_PATH/scripts/deploy.sh"

# TODO reference the .env file in the VPS
# TODO mount DB file
ssh -p $SSH_PORT $VPS "$APP_PATH/scripts/restart-container.sh"

echo "Deployed!"
