#!/bin/bash
# Start Arize Phoenix using Docker/OrbStack
#
# Usage:
#   ./scripts/start-phoenix.sh
#   ./scripts/start-phoenix.sh --detach  # Run in background

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if Docker/OrbStack is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker/OrbStack is not installed or not in PATH"
    echo "   Install OrbStack from: https://orbstack.dev/"
    exit 1
fi

# Check if container is already running
if docker ps --format '{{.Names}}' | grep -q "^feishu-phoenix$"; then
    echo "✅ Phoenix container is already running"
    echo "   Dashboard: http://localhost:6006"
    exit 0
fi

# Check if container exists but is stopped
if docker ps -a --format '{{.Names}}' | grep -q "^feishu-phoenix$"; then
    echo "🔄 Starting existing Phoenix container..."
    docker start feishu-phoenix
else
    echo "🚀 Starting Phoenix container for the first time..."
    if [ "$1" == "--detach" ] || [ "$1" == "-d" ]; then
        docker compose -f docker-compose.phoenix.yml up -d
    else
        docker compose -f docker-compose.phoenix.yml up
    fi
fi

# Wait a moment for container to be ready
sleep 2

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^feishu-phoenix$"; then
    echo ""
    echo "✅ Phoenix is running!"
    echo "   Dashboard: http://localhost:6006"
    echo "   Traces endpoint: http://localhost:6006/v1/traces"
    echo ""
    echo "To stop: docker stop feishu-phoenix"
    echo "To view logs: docker logs -f feishu-phoenix"
else
    echo "❌ Failed to start Phoenix container"
    exit 1
fi
