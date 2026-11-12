#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Autonomous Crypto Trading Agent - Termux (Android aarch64) Runner
# ==============================================================================
set -e

echo "=== [1/3] Checking Termux Node.js Environment ==="
if ! command -v node &> /dev/null; then
    echo "Installing Node.js in Termux..."
    pkg update -y && pkg install -y nodejs
fi

echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=== [2/3] Installing Dependencies ==="
if [ ! -d "node_modules" ]; then
    npm install
fi

echo ""
echo "=== [3/3] Launching Autonomous Crypto Trading Agent ==="
# LIVE trading only. Requires API_KEY / API_SECRET in .env
npx tsx src/cli.ts "$@"
