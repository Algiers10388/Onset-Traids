#!/usr/bin/env bash
# Starts the searcher LIVE (it broadcasts real transactions). The searcher does not read .env itself, so this loads it.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f ../../.env ]; then set -a; . ../../.env; set +a; fi
# Default payment wallet: MetaMask. Profits are paid out in the borrowed token (USDC, WETH, ...); a normal wallet accepts any ERC-20.
export FLASH_ARB_PROFIT_WALLET="${FLASH_ARB_PROFIT_WALLET:-0x65602EB9e09B07002872E074004400d37e27CCB9}"
: "${FLASH_ARB_SIGNER_KEY:?set FLASH_ARB_SIGNER_KEY in .env (gas wallet key; keep only a little ETH in it)}"
echo "profit wallet: $FLASH_ARB_PROFIT_WALLET"
exec cargo run --release -- "$@"
