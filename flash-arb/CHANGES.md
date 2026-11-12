# flash-arb v0.2: what was wrong and what changed

Nothing in this folder could be compiled where it was reviewed (no rustc/forge/solc available), so **run `cargo check`, `cargo test` and `forge test` first.**
The sizing math was checked numerically separately (closed form vs brute force).

## Critical (money-losing or fund-stealing)
| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 1 | `FlashArbOptimized.sol` | Entry points and `receiveFlashLoan` both used the transient reentrancy lock, so the callback always reverted (`ReentrancyGuardLocked`): **no flash loan could ever succeed**. The hand-written revert selector was also unverified. | One lock, taken once; callback checks it. Uses `revert ReentrancyGuardLocked()`. |
| 2 | `FlashArbOptimized.sol` | No access control: anyone could start a loan with their own `recipient`/`minProfit` (or call Balancer directly with this contract as recipient) and sweep any token balance held here; `executeDirectFlashArb` let anyone send out the contract's ETH. | All entrypoints `onlyOwner`. Callback only runs if `keccak256(userData)` equals a commitment the owner stored in transient storage in the same tx. |
| 3 | `executor.rs` vs contract | Rust sent 4-word "legacy" data, which the contract treated as a no-swap repay path: profit always 0 < minProfit, so every live tx would revert and burn gas. | Rust calls `executeOptimizedArbitrage(...)` with real routers/fees/route type; legacy and "pass-through" branches removed. |
| 4 | `monitor.rs` / `main.rs` | Pools were **fabricated**: router addresses used as pool addresses, hard-coded reserves with a baked-in spread, and a V3 `sqrtPriceX96` that equals about $4e12/ETH. `simulate_two_hop` returned input x 1.0025. The bot "found" huge fake opportunities every tick. | Pools discovered via factories; state read each block with eth_call; real constant-product sizing. |
| 5 | `sim.rs` | The "revm simulation" never touched the chain (returned a constant `312450` gas and `success`). | Real `eth_estimateGas` of the exact call; live mode refuses unverified trades. |
| 6 | `*.toml` | `dry_run = false` shipped on all chains with a zero contract address. | `dry_run = true`; live needs `--live` + TOML flag + deployed contract + key + profit wallet. |
| 7 | `executor.rs` | Profit wallet and gas wallet had hard-coded fallback addresses (and they differ from `server/flashArbRoutes.ts`, see below). | `FLASH_ARB_PROFIT_WALLET` must be set; no fallback. |

## Other fixes
- `foundry.toml`: `evm_version = "paris"` cannot compile `tstore/tload`; now `cancun`; `via_ir = true` like `compile-contracts.cjs`.
- Base/Optimism Uniswap routers are SwapRouter02 (no `deadline` field); the old struct reverted there. `_swapV3` now tries v1 then v02.
- `_safeApprove` ignored failures; `asset.transfer` return values were unchecked (breaks USDT). Replaced with checked helpers; removed the unauthenticated `uniswapV3SwapCallback`, the broken `executeArbitrage` (never swapped: `tokenOut = 0`) and `fallback()`.
- `as_u128()` calls could panic on real V3 prices; now panic-free f64 conversion. `panic = "abort"` removed.
- ETH price: Binance/CoinGecko with a silent `2850.0` fallback and fake ARB/OP/WBTC prices; now on-chain WETH/USDC price, bases are WETH/USDC only.
- Arbitrum `rpc_ws` pointed at the sequencer feed (not JSON-RPC); WebSocket dropped, blocks are polled over HTTP. Override RPC with `FLASH_ARB_RPC_<CHAIN>`.
- Reverted-gas loss used a hard-coded 0.1 gwei; now the receipt's effective gas price. The "daily" loss cap now resets at 00:00 UTC.
- Removed unused heavy deps (`revm`, `uniswap-v3-math`, `reqwest`, ...); `lto = "thin"` so it builds on Termux.
- New offline tests: `contracts/test/FlashArbOptimized.t.sol` (mock vault/routers) and math tests in `routes.rs`.

## Not fixed here (needs your decision)
- `server/flashArbRoutes.ts` "live agent" calls `executeDirectFlashArb(recipient)` and then labels the result `CONFIRMED` with a profit figure. That function only sweeps ETH; **it performs no arbitrage**. Treat those dashboard "trades" as not real.
- The server defaults the profit wallet to `0x6560...ccb9` and overwrites `0xc102...f15d` (the address in the TOMLs). Pick one.
- `executeDirectFlashArb` is now `onlyOwner`; the "connected Web3 wallet" fallback only works if that wallet is the contract owner.
- Model limits: V3 pools are treated as constant-product in the current range (cap 2% of reserves); the L1 data fee is a flat $0.15 allowance; Camelot's per-pair fee is assumed 0.3%. The eth_call simulation is the real check.

## v0.2.1: autonomy / efficiency
- **Multicall3 batching**: all pool state for a chain is read in one `eth_call` per 50 pools (was 1-2 calls per pool per block), pinned to the polled block; pools that fail to refresh are skipped for that block.
- **Size retries**: if the eth_call simulation rejects the model-optimal loan (typical for V3 pools whose liquidity ends early), the searcher retries at 50% and 25% before giving up.
- **Self-healing workers**: a crashed chain worker restarts with exponential backoff (5s to 5 min); the circuit breaker and daily-loss counters live outside the restart loop, so a restart can't re-arm a tripped breaker.
- **One-command deploy**: `npm run compile:flash-arb`, then `FLASH_ARB_SIGNER_KEY=... CONFIRM_DEPLOY=yes npm run deploy:flash-arb -- arbitrum` deploys, verifies ownership and writes `flash_arb_contract` into the TOML (dry run without `CONFIRM_DEPLOY=yes`).
- **Server agent neutralised**: `server/flashArbRoutes.ts` no longer auto-broadcasts (`isAutonomousExecutionEnabled` defaults to false, the autonomous path hard-returns, and `/agent/trigger` answers 409). Its "trades" were ETH sweeps labelled as profitable arbitrage.

## v0.2.2: server access control (found in review of `server.ts` / `server/*`)
- **~88 `/api` routes had no authentication and the server listened on `0.0.0.0`.** That included `POST /api/flash-arb/signer-config`
  (set the signer key), `POST /api/flash-arb/agent/initialize-signer` (**returned the full private key on every call**),
  contract deploy/execute routes, exchange order routes, and fiat/wallet routes. The browser client sends no credentials to them.
- Now: the server binds to `127.0.0.1` by default (`HOST=` to override; `0.0.0.0` only when `K_SERVICE` is set, i.e. Cloud Run).
  Every `/api` route except `/api/health` and the five Firebase-authed user routes accepts **local requests only**, or a request carrying
  `x-api-token` equal to `API_ACCESS_TOKEN`. Requests with `X-Forwarded-*` headers (nginx/Cloud Run) never count as local.
- `initialize-signer` returns the private key only when it has just created it; an existing key is never sent back.
- Consequence: if you deploy this publicly, the browser UI will get 403s until you add the token to its fetches. That is deliberate.
- If this server was ever reachable from the internet with a signer key configured, treat that key as compromised and rotate it.

## Live-only change
- Removed `dry_run`, `--dry-run` and `--live`. The searcher always broadcasts verified trades; chains without a deployed contract are skipped, and it exits if the signer key or profit wallet is missing. Setup scripts now only `cargo build` instead of running the searcher. Not compiled here (no cargo available): run `cargo check && cargo test`.

## v0.3.1: default payment wallet = MetaMask `0x65602EB9e09B07002872E074004400d37e27CCB9` (your decision)
- TOML `[beneficiary]` now matches (informational only: the searcher reads `FLASH_ARB_PROFIT_WALLET`).
- `searcher/run-live.sh` loads `.env` and defaults `FLASH_ARB_PROFIT_WALLET` to that address; setting the env var overrides it.
- The server no longer overwrites a user-set `FLASH_ARB_PROFIT_WALLET`; it only supplies this default when unset.
- Dashboard: the default button/labels said "Cake Wallet (..5d)" but saved the MetaMask address; they now say MetaMask.
