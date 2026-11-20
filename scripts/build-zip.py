#!/usr/bin/env python3
import os
import zipfile

def build_flash_arb_zip():
    targets = ['public/flash-arb.zip', 'dist/flash-arb.zip']
    os.makedirs('public', exist_ok=True)
    os.makedirs('dist', exist_ok=True)

    bundle_folders = ['flash-arb', 'trade-agent']

    for target in targets:
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            # 1. Add top-level README
            suite_readme = """# Quantitative Crypto Trading Suite & Multi-Chain Flash Loan Arbitrage Engine

This package contains two complete, live-execution quantitative systems:

1. `trade-agent/`:
   - Autonomous CEX Spot Trading Agent with MACD (12, 26, 9), RSI (14), Bollinger Bands (20, 2), Regular Divergence, and Confluence Scoring (0-100%).
   - Multi-Exchange Live Execution: Binance, OKX, Coinbase, Bybit, Kraken.
   - Dynamic Risk Management: Daily loss circuit breakers, fractional Kelly position sizing, Take-Profit, Stop-Loss, and peak-tracking Trailing Stops.
   - One-click runners: `run_termux.sh` (Android), `run_wsl.sh` (Linux), `run_powershell.ps1` (Windows).

2. `flash-arb/`:
   - Smart Contracts (`contracts/`): Cancun EIP-1153 `FlashArbOptimized.sol` (Balancer V2 0% fee & Aave V3 0.05% fallback; Route Types 1-4 across UniV3, PancakeV3, SushiV3, QuickSwap/Camelot V3, and V2).
   - Searchers (`searcher/` & Node server `server/flashArbRoutes.ts`): Multicall3 live pool polling across 10 chains (Ethereum, Polygon, BSC, Arbitrum, Base, Optimism, Avalanche, Linea, Scroll, ApeChain), closed-form S* depth sizing, zero-gas `eth_call` pre-flight verification, continuous auto-trading, and automatic Profit Vault (`0xD5503C876a5DFeE057727cfacb6a59E8C7554f5b`) sweeping.
   - Cross-platform Foundry & Cargo runners for Termux, WSL, and Windows.
"""
            zinfo_root = zipfile.ZipInfo("README.md")
            zinfo_root.external_attr = 0o644 << 16
            zf.writestr(zinfo_root, suite_readme)

            # 2. Add flash-arb and trade-agent trees
            for folder in bundle_folders:
                if not os.path.isdir(folder):
                    continue
                for root, dirs, files in os.walk(folder):
                    # Exclude node_modules, git, target, out, cache
                    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'target', 'out', 'cache', '.cache', 'dist')]
                    dirs.sort()
                    files.sort()
                    for file in files:
                        if file.endswith('.DS_Store') or file.endswith('.log'):
                            continue
                        file_path = os.path.join(root, file)
                        arcname = file_path
                        zinfo = zipfile.ZipInfo.from_file(file_path, arcname=arcname)
                        # Preserve executable bits for shell and powershell scripts
                        if file.endswith('.sh') or file.endswith('.ps1'):
                            zinfo.external_attr = 0o755 << 16
                        else:
                            zinfo.external_attr = 0o644 << 16
                        with open(file_path, 'rb') as f:
                            zf.writestr(zinfo, f.read())
        print(f"Packaged {target} ({os.path.getsize(target)} bytes)")

if __name__ == '__main__':
    build_flash_arb_zip()
