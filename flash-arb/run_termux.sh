#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# FlashArb One-Click Runner for Termux (Android aarch64)
# ==============================================================================
# Solves: "version not found in artifacts for this platform"
# In Termux (Android), svm-rs has no remote binaries for linux-android.
# This script installs Termux's native solc and invokes forge using `--use $(which solc)`.
# ==============================================================================

set -e

echo "=== [1/4] Checking Termux Dependencies ==="
pkg update -y

if ! command -v solc &> /dev/null; then
    echo "Installing native Solidity compiler package ('solidity') for Android aarch64..."
    pkg install -y solidity || pkg install -y solc
fi

if ! command -v forge &> /dev/null; then
    echo "Foundry 'forge' not found in PATH."
    echo "Installing Foundry or ensuring cargo path is active..."
    if ! command -v cargo &> /dev/null; then
        pkg install -y rust clang
    fi
    cargo install --git https://github.com/foundry-rs/foundry --locked forge
fi

SOLC_BIN=$(which solc || true)
if [ -z "$SOLC_BIN" ] && [ -f "/data/data/com.termux/files/usr/bin/solc" ]; then
    SOLC_BIN="/data/data/com.termux/files/usr/bin/solc"
fi

if [ -n "$SOLC_BIN" ]; then
    echo "Found native solc binary: $SOLC_BIN"
    "$SOLC_BIN" --version
    export FOUNDRY_SOLC="$SOLC_BIN"
else
    echo "Warning: solc not found in PATH. Foundry will attempt to resolve compiler automatically."
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/contracts" ]; then
    CONTRACTS_DIR="$SCRIPT_DIR/contracts"
else
    CONTRACTS_DIR="$SCRIPT_DIR"
fi

echo ""
echo "=== [2/4] Compiling FlashArb Smart Contracts ==="
cd "$CONTRACTS_DIR"

# Clean any stale build artifacts or failed compiler caches
forge clean

# Build contracts using the local native Termux solc (completely bypasses remote svm artifact download)
if [ -n "$SOLC_BIN" ]; then
    forge build --use "$SOLC_BIN"
else
    forge build
fi

echo ""
echo "=== [3/4] Running Offline Contract Tests (mock vault/routers, no network) ==="
USE_ARG=""
if [ -n "$SOLC_BIN" ]; then USE_ARG="--use $SOLC_BIN"; fi
forge test $USE_ARG --match-path "test/FlashArbOptimized.t.sol" -vv

# Optional: fork tests against live Arbitrum state (needs a working RPC; an old pinned block needs an ARCHIVE node,
# so this uses the latest block). Run with: RUN_FORK_TESTS=1 ./run_termux.sh
if [ "${RUN_FORK_TESTS:-0}" = "1" ]; then
    echo "=== Running Arbitrum fork tests (latest block) ==="
    forge test $USE_ARG --match-path "test/FlashArb.t.sol" --fork-url "${FORK_RPC_URL:-https://arb1.arbitrum.io/rpc}" -vvv
fi

echo ""
echo "=== [4/4] Building Rust Searcher (build only; it does not start trading) ==="
if [ -d "$SCRIPT_DIR/searcher" ]; then
    cd "$SCRIPT_DIR/searcher"
elif [ -d "$SCRIPT_DIR/../searcher" ]; then
    cd "$SCRIPT_DIR/../searcher"
fi

if command -v cargo &> /dev/null; then
    cargo build --release  # build only; start LIVE yourself: cargo run --release -- --chains arbitrum
else
    echo "Cargo not found in PATH. Skipping searcher build."
fi
