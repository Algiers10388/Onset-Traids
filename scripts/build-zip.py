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
            suite_readme = """# Quantitative Crypto Trading Suite & Flash Loan Arbitrage Engine

This package contains two complete, production-ready quantitative systems:

1. `trade-agent/`:
   - Autonomous Crypto Trading Agent with MACD (12, 26, 9), RSI (14), Bollinger Bands (20, 2), Regular Divergence, and Confluence Scoring (0-100%).
   - Multi-Exchange Execution: Paper Trading / Dry-Run (zero keys needed) & Authenticated Live Trading on Binance, OKX, Coinbase, Bybit, Kraken.
   - Dynamic Risk Management: Daily loss circuit breakers, fractional Kelly position sizing, Take-Profit, Stop-Loss, and peak-tracking Trailing Stops.
   - One-click runners: `run_termux.sh` (Android), `run_wsl.sh` (Linux), `run_powershell.ps1` (Windows).

2. `flash-arb/`:
   - Smart Contracts (`contracts/`): Atomic flash loan arbitrage executor (Aave V3, Uniswap V3, Curve, Camelot) written in Solidity (^0.8.20).
   - Rust Searcher (`searcher/`): Low-latency WebSocket pool monitor, closed-form V2 & ternary V3 loan sizer, revm state simulator, and private relay tx builder.
   - Cross-platform Foundry runners for Termux, WSL, and Windows.
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
