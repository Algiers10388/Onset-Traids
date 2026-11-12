#!/bin/bash
# ==============================================================================
# FlashArb One-Click Runner for WSL (Windows Subsystem for Linux) & Linux - Contracts Suite
# ==============================================================================
# WSL runs standard Linux x86_64 or aarch64 with full glibc support.
# ==============================================================================

set -e

echo "=== [1/3] Checking WSL / Linux Prerequisites ==="
if ! command -v forge &> /dev/null; then
    echo "Installing Foundry via foundryup..."
    curl -L https://foundry.paradigm.xyz | bash
    export PATH="$HOME/.foundry/bin:$PATH"
    foundryup
fi

if ! command -v cargo &> /dev/null; then
    echo "Rust cargo not found. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/contracts" ]; then
    CONTRACTS_DIR="$SCRIPT_DIR/contracts"
else
    CONTRACTS_DIR="$SCRIPT_DIR"
fi

echo ""
echo "=== [2/3] Compiling and Testing FlashArb Contracts ==="
cd "$CONTRACTS_DIR"

forge clean
# Offline tests (mock vault/routers, no network)
forge test --match-path "test/FlashArbOptimized.t.sol" -vv
# Optional fork tests against live Arbitrum state (latest block; an old pinned block needs an archive node):
#   RUN_FORK_TESTS=1 ./run_wsl.sh
if [ "${RUN_FORK_TESTS:-0}" = "1" ]; then
    forge test --match-path "test/FlashArb.t.sol" --fork-url "${FORK_RPC_URL:-https://arb1.arbitrum.io/rpc}" -vvv
fi

echo ""
echo "=== [3/3] Building Multi-Chain Searcher ==="
if [ -d "$SCRIPT_DIR/searcher" ]; then
    cd "$SCRIPT_DIR/searcher"
elif [ -d "$SCRIPT_DIR/../searcher" ]; then
    cd "$SCRIPT_DIR/../searcher"
fi

cargo build --release  # build only; start LIVE yourself: cargo run --release -- --chains arbitrum
