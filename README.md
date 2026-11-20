# Multi-Chain Crypto Arbitrage & Quantitative Trading Suite

Production full-stack platform combining a **10-Chain Live Flash Loan Arbitrage Engine (L1–L4)**, a **Solidity `FlashArbOptimized` Smart Contract Executor**, an optional **Rust Low-Latency Searcher (`flash-arb/searcher`)**, and an **Autonomous CEX Quantitative Trade Agent (`trade-agent`)**.

---

## 1. Live Flash Arbitrage Architecture (Current Deployment)

| Chain | Layer | Status | Active `FlashArbOptimized` Contract |
|---|---|---|---|
| **Ethereum Mainnet** | L1 | Deployed & Verified (6/6 routes) | `0x5901B4B159Ea0Cab54effcbF00F0076c96AD898D` |
| **Polygon PoS** | L1 | Deployed & Verified (6/6 routes) | `0xBBA273E057cDa31bB359d8AA8749256246B6d0cC` |
| **BNB Smart Chain (BSC)** | L1 | Deployed & Verified (6/6 routes) | `0xBBA273E057cDa31bB359d8AA8749256246B6d0cC` |
| **Arbitrum One** | L2 | Deployed & Verified (6/6 routes) | `0xEEe31Ff9e69904B43c124095b6f33aA61505bCc2` |
| **Base L2** | L2 | Deployed & Verified (6/6 routes) | `0x37440674a814f24d9C6ea0990b272215D40c4512` |
| **Optimism Mainnet** | L2 | Live Scan Ready (`0x` undeployed) | `0x738C8Eb31316B23d9b8A68B0c2658B456c932598` (deploy needed) |
| **Avalanche / Linea / Scroll / ApeChain** | L1–L3 | Live Pool Scanning Only | Deploy via **Contract Panel** to enable execution |

### Treasury & Wallet Separation (Zero-Custody)
- **Gas Funder / Active Execution Signer (`FLASH_ARB_SIGNER_KEY`)**: `0xF1d765d693f9e6fAb0c4a2FCa942d9D54233C966` — pays gas and owns the deployed contracts.
- **Profit Vault (`FLASH_ARB_PROFIT_WALLET`)**: `0xD5503C876a5DFeE057727cfacb6a59E8C7554f5b` — receives 100% of realized arbitrage profit and swept balances. Never stores private keys on the profit wallet.

---

## 2. Dashboard Automation & Operator Guide

### Top MEV Searcher Agent Console Bar
1. **Start Auto-Trading / Stop Auto-Trading**
   - Arms or disarms **24/7 continuous autonomous execution** (`isAutonomousExecutionEnabled`).
   - Automatically starts background scanning if paused and evaluates deployed chains continuously (`4.5s` loop, `8s` cadence across deployed chains even if the browser tab is backgrounded).
   - Only broadcasts transactions that clear **Strict Profit Guard** (`estNetProfitUsd >= minProfitThresholdUsd`, default `$0.01`, unbounded upside) AND pass real pre-flight `eth_call` / `eth_estimateGas`.
2. **Pause Scanner / Resume Scanner**
   - Toggles live Multicall3 pool polling across all 10 chains without altering your wallet settings.
3. **Auto-Sweep: ON / OFF**
   - When ON, automatically sweeps compatible ERC-20 / ERC-1155 / ETH surplus dust from contracts and signer surplus (keeping a `0.002 ETH` gas reserve) directly to your Profit Vault after each confirmed trade cycle.
4. **Sweep All to Vault**
   - Manually sweeps all eligible tokens and surplus native gas from deployed contracts to your Profit Vault (`0xD550...f5b`).
5. **Trigger Live On-Chain Trade**
   - Forces an immediate scan and attempts pre-flight verification + live broadcast on the selected chain's best executable route.

### Verifying Live Routes (Zero Gas Spent)
- Open **Flash Arbitrage → Monitor → Live L1–L4 Verification & Contract Route Types (1–4)**.
- Click **Verify All Deployed** (calls `POST /api/flash-arb/agent/verify-v3` with `chain: "deployed"`) or **Probe Routes (<Chain>)** to test real Balancer V2 / Aave V3 flash loans + DEX swaps via zero-gas `eth_call` directly against the live contracts.

### Searcher Parameters & Strict Profit Guard
- **Min Net Profit Threshold**: Default `$0.01` (configurable; no max cap).
- **Dynamic Size Optimizer ($S^*$)**: Automatically computes optimal flash-loan sizing (from `$1` up to `150 ETH` eq) capped by pool depth & slippage limits.
- **Gas Profile**: `ECO` (zero-tip on Arbitrum FCFS, `0.001 Gwei` L2 tip), `HYPER_ALPHA`, or `AGGRESSIVE`.
- **Auto-Optimize Parameters**: Resets to L2-calibrated defaults (`$0.01` guard, `ECO` gas, Dynamic $S^*$) and refreshes live pool quotes.

---

## 3. Supported Contract Route Types (1–4)
`FlashArbOptimized.sol` supports 4 atomic route types inside a single Balancer V2 (`0%` fee) or Aave V3 (`0.05%` fee) flash loan transaction:
- **Type 1 (`V3 -> V2`)**: Uniswap V3 / PancakeSwap V3 / SushiSwap V3 / Algebra → Uniswap V2 / SushiSwap V2 / Camelot V2 / QuickSwap V2.
- **Type 2 (`V2 -> V3`)**: V2 pool → V3 / Algebra pool.
- **Type 3 (`V3 -> V3`)**: Cross-venue or multi-fee-tier V3 ↔ V3 (e.g., `0.01%` vs `0.05%` or Uniswap V3 ↔ PancakeSwap V3 / SushiSwap V3 / QuickSwap V3).
- **Type 4 (`V2 -> V2`)**: Direct V2 ↔ V2 pool arbitrage.

*(Note: Camelot V3 on Arbitrum uses Algebra dynamic-fee pools; upgrade `FlashArbOptimized` on Arbitrum or deploy `CamelotV3SwapAdapter` from the Contract Panel to enable native Camelot V3 execution.)*

---

## 4. Running Locally / Standalone CLI Searchers

### Web App & Backend API (`server.ts`)
```bash
npm install
npm run dev       # Starts Express + Vite on port 3000
npm run lint      # Runs tsc --noEmit
npm run build     # Compiles Solidity contracts + Vite production bundle
npm start         # Starts compiled production server
```

### Rust FlashArb Searcher (`flash-arb/`)
See `flash-arb/README.md` and `flash-arb/CHANGES.md` for Cargo build instructions and TOML chain configuration.

### CEX Trade Agent (`trade-agent/`)
See `trade-agent/README.md` for live Binance / OKX / Coinbase / Bybit / Kraken spot strategy execution.
