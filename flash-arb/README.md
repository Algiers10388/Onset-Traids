# FlashArb: multi-chain flash loan arbitrage (Arbitrum / Base / Optimism)

Rust searcher + Solidity executor. **Read `CHANGES.md` first**: v0.2 replaced the simulated data path with real on-chain reads and fixed contract bugs that made every live trade revert.

```text
searcher (Rust, one Tokio worker per chain)
  monitor.rs   factory lookups -> pools; each new block: getReserves() / slot0()+liquidity() over JSON-RPC
  routes.rs    constant-product model of two pools, closed-form optimal loan, USD net profit after gas
  sim.rs       eth_estimateGas of the exact contract call from the owner address (real simulation, or "UNVERIFIED")
  executor.rs  sign + broadcast (live only, after every guard passes; there is no dry-run/paper mode)
  risk.rs      circuit breaker, daily gas-loss cap (resets 00:00 UTC), token exclusion list
contracts (Solidity, Foundry)
  FlashArbOptimized.sol   Balancer V2 flash loan (0% fee) -> leg 1 -> leg 2 -> repay -> sweep profit; reverts unless profit >= minProfit
  FlashArb.sol            Aave V3 variant (0.05% fee), kept for reference/tests
```

Supported venues: Uniswap V3 (SwapRouter v1 and SwapRouter02 auto-detected), Uniswap-V2-style routers (Camelot V2, Sushiswap V2).
Not supported (skipped): Curve, Aerodrome, Velodrome (Solidly router ABI).

## Run (LIVE only)

The searcher has no paper or dry-run mode. It refuses to start a chain unless `flash_arb_contract` is deployed, and it
exits unless `FLASH_ARB_SIGNER_KEY` and `FLASH_ARB_PROFIT_WALLET` are set. Every trade is verified with `eth_estimateGas`
against the deployed contract before it is signed and broadcast.

1. `cd contracts && forge build && forge test --match-path test/FlashArbOptimized.t.sol -vvv`
2. Deploy `FlashArbOptimized(balancerVault, aavePool)` from the wallet that will be the owner; put the address in `flash_arb_contract`.
3. `export FLASH_ARB_SIGNER_KEY=<owner key>`, `export FLASH_ARB_PROFIT_WALLET=<where profit goes>` (no default exists).
4. `cd searcher && ./run-live.sh --chains arbitrum` (LIVE; loads `../../.env` and defaults `FLASH_ARB_PROFIT_WALLET` to MetaMask `0x6560...ccb9`; optional: `export FLASH_ARB_RPC_ARBITRUM=https://<your-node>`).

## Honest expectations

Atomic two-pool arbitrage on public L2s is a competitive, latency-driven game. With public RPCs and a 2 s poll the searcher will
mostly see spreads that are already gone. A 0.6% gap on two ~$2M pools is about $1.5 gross, below gas + the L1 data fee. Start with a small signer balance and watch the logs
for verified candidates that clear your `min_net_profit_usd`.
