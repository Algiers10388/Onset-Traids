#!/bin/bash
# ==============================================================================
# Autonomous Crypto Trading Agent - WSL / Linux Runner
# ==============================================================================
set -e

echo "=== [1/3] Checking Node.js Environment ==="
if ! command -v node &> /dev/null; then
    echo "Node.js not detected. Please install Node.js (v18+ recommended)."
    exit 1
fi

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=== [2/3] Installing Dependencies ==="
if [ ! -d "node_modules" ]; then
    npm install
fi

echo ""
echo "=== [3/3] Launching Autonomous Crypto Trading Agent ==="
npx tsx src/cli.ts "$@"
