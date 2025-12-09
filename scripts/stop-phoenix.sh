#!/bin/bash
# Stop Arize Phoenix container

set -e

if docker ps --format '{{.Names}}' | grep -q "^feishu-phoenix$"; then
    echo "🛑 Stopping Phoenix container..."
    docker stop feishu-phoenix
    echo "✅ Phoenix stopped"
else
    echo "ℹ️  Phoenix container is not running"
fi
