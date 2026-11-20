# FlashArb: Multi-Chain Atomic Flash Loan Arbitrage (10 Chains: L1–L4)

Full-stack MEV arbitrage system combining:
1. **Node/TypeScript Live Searcher & Executor (`server/flashArbRoutes.ts`, `server/flashArbExecutor.ts`)** — continuous Multicall3 RPC pool scanning across 10 EVM chains (`Ethereum`, `Polygon`, `BSC`, `Avalanche`, `Arbitrum`, `Base`, `Optimism`, `Linea`, `Scroll`, `ApeChain`), closed-form $S^*$ depth sizing (`server/arbSizing.ts`), zero-gas `eth_call` + `eth_estimateGas` pre-flight verification, autonomous 24/7 execution, and end-of-cycle Profit Vault sweeping.
2. **Rust Standalone Searcher (`searcher/`)** — Tokio multi-chain worker with `monitor.rs`, `routes.rs`, `sim.rs`, `executor.rs`, and `risk.rs`.
3. **Solidity Executor (`contracts/src/FlashArbOptimized.sol`)** — Cancun EIP-1153 transient reentrancy guards, Balancer V2 `0%` flash loans (with Aave V3 `0.05%` fallback), direct pool / router swaps across Route Types 1–4, and atomic Profit Guard enforcement.

**Read `CHANGES.md` for the changelog from v0.2 through v0.4.**

---

## Supported DEX Venues & Route Types (1–4)

- **Route Type 1 (`V3 -> V2`)**, **Type 2 (`V2 -> V3`)**, **Type 3 (`V3 -> V3`)**, **Type 4 (`V2 -> V2`)**
- **Supported V3 / Algebra DEXs**: Uniswap V3 (SwapRouter v1 & SwapRouter02 auto-detected), PancakeSwap V3, SushiSwap V3, QuickSwap V3 (Algebra on Polygon), Camelot V3 (via upgraded `FlashArbOptimized` or `CamelotV3SwapAdapter` on Arbitrum).
- **Supported V2 DEXs**: Uniswap V2, SushiSwap V2, QuickSwap V2, BaseSwap V2, Camelot V2.
- **Not Executed On-Chain (Scan-Only)**: Solidly/ve(3,3) routers (Aerodrome, Velodrome) and Curve pools without compatible adapter wiring.

---

## Live Wallets & Deployed Contracts

- **Profit Vault (`FLASH_ARB_PROFIT_WALLET`)**: Defaults to `0xD5503C876a5DFeE057727cfacb6a59E8C7554f5b` (all arbitrage profits and swept balances route here).
- **Signer / Gas Wallet (`FLASH_ARB_SIGNER_KEY`)**: `0xF1d765d693f9e6fAb0c4a2FCa942d9D54233C966` (must own the target contract to execute `onlyOwner` flash loans and rescue sweeps).
- **Verified Live Contracts (`.flash-arb-deployments.json`)**:
  - Ethereum: `0x5901B4B159Ea0Cab54effcbF00F0076c96AD898D`
  - Polygon: `0xBBA273E057cDa31bB359d8AA8749256246B6d0cC`
  - BSC: `0xBBA273E057cDa31bB359d8AA8749256246B6d0cC`
  - Arbitrum One: `0xEEe31Ff9e69904B43c124095b6f33aA61505bCc2`
  - Base L2: `0x37440674a814f24d9C6ea0990b272215D40c4512`
  - Optimism: `0x738C8Eb31316B23d9b8A68B0c2658B456c932598` *(currently `0x` bytecode — deploy from Contract Panel to enable execution)*

---

## Quick Start

### Option A: Web Searcher & Dashboard (Recommended)
1. Start the app (`npm run dev` on port `3000`).
2. Open the **Flash Arbitrage** tab:
   - Click **Start Auto-Trading** in the top MEV Agent Console Bar to enable continuous 24/7 autonomous execution across deployed chains.
   - Toggle **Auto-Sweep: ON** to sweep profits/token dust to `0xD550...f5b` after each confirmed trade cycle.
   - Click **Verify All Deployed** inside the Verification Matrix to run zero-gas `eth_call` checks across every deployed chain (`6/6` routes verified on Ethereum, Polygon, BSC, Arbitrum, and Base).
   - Click **Trigger Live On-Chain Trade** for immediate manual execution when a route clears **Strict Profit Guard**.

### Option B: Standalone Rust Searcher (`flash-arb/searcher`)
1. `cd contracts && forge build && forge test --match-path test/FlashArbOptimized.t.sol -vvv`
2. Deploy `FlashArbOptimized(balancerVault, aavePool)` from your signer wallet and set the address in `flash_arb_contract`.
3. Configure `.env` or export:
   ```bash
   export FLASH_ARB_SIGNER_KEY=<owner_private_key>
   export FLASH_ARB_PROFIT_WALLET=0xD5503C876a5DFeE057727cfacb6a59E8C7554f5b
   ```
4. Launch live worker:
   ```bash
   cd searcher && ./run-live.sh --chains arbitrum
   ```
   *(Optional: override RPC endpoints via `FLASH_ARB_RPC_ARBITRUM=https://<your-node>`.)*

---

## Risk & Zero-Loss Guarantees
- **Zero Simulation Fallbacks**: All pool prices, fee tiers, balances, and gas estimates come strictly from live JSON-RPC calls (`Multicall3` + `eth_call` + `eth_estimateGas`).
- **Pre-Flight Profit Guard**: Both the off-chain pre-flight simulator and the on-chain `FlashArbOptimized.sol` contract revert with `InsufficientProfit` if realized return fails to exceed flash-loan repayment plus `minProfitThresholdUsd` (`$0.01` default).
