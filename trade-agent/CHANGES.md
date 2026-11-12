# trade-agent: fixes in this version

Root cause of the "fake-looking" paper-trading log: both Binance calls were failing
(blocked/offline), so the agent silently fell back to (a) a fresh random-walk candle
series on every tick and (b) hard-coded prices 68500 / 2650 / 150. Entries (150.03 = 150 x 1.0002)
and exits (149.97 = 150 x 0.9998) used the hard-coded price while signals, SL and TP used the
random walk, so SL sat above entry, every exit had the same -0.20%, and RSI jumped 46 -> 71 in one tick.

## Fixed
- No silent fake data. Real feeds with fallback: data-api.binance.vision -> api.binance.com -> api.binance.us -> OKX -> Bybit.
  If all fail the tick is skipped with `[DATA FEED DOWN]`. Synthetic data only with `--demo`, as a persistent walk.
- One price per decision: entry/exit fills, SL, TP and PnL all derive from the price the strategy saw; SL/TP re-based on the fill.
- Stop-loss/take-profit use the ATR price levels only (the leveraged-% rules no longer override them).
- Stop distance has a floor (`minStopDistancePercent`, default 0.5%) used for both sizing and the stop price.
- Fees charged on notional (entry + exit) and included in realized PnL and the circuit breaker.
- Failed exit orders no longer book a fake close. Exits sell the quantity actually bought.
- Circuit breaker: shows why it tripped, `maxConsecutiveLosses` is configurable (0 = off), and daily counters reset at 00:00 UTC.
- 2-minute re-entry cooldown per symbol (`reentryCooldownMs`).
- Ctrl+C now actually closes open positions. Header shows equity (cash + locked margin + unrealized), not just cash.
- RSI of exactly 0 was reported as 50 (`|| 50`).
- Bollinger squeeze is relative to recent bandwidth (a fixed 3.5% is always true on 1m bars).
- CLI: loads `.env` (dotenv was never imported), validates flags, `--backtest` no longer pretends to work,
  `--live` without keys no longer silently paper-trades.
- Live execution: spot only (leverage must be 1), unsupported exchanges return an error instead of a fake "filled" order,
  Binance fill price from fills, OKX `tgtCcy=base_ccy` (sz was being read as USDT), OKX testnet header.

## Known limits (not changed)
- Signals use the still-forming 1m candle, so they can flicker within a minute.
- `detectDivergence` compares two points 15 bars apart, not real swing pivots.
- No backtester yet; paper results on 1m data are dominated by fees (about 0.12% of notional per round trip).

## v1.2: live only (no paper / dry-run / demo)
- Removed the paper fill path, `PAPER_TRADING`, `--demo`, `--dry-run`/`--live` flags and the synthetic data feed. Real market data and real orders only.
- Capital comes from your real free USDT (`fetchQuoteBalance` on Binance/OKX), optionally capped with `--capital=`. The invented $10,000 treasury is gone.
- Spot only: leverage is always 1 (the CLI rejects `--leverage` other than 1). Binance quantity is floored to the symbol's LOT_SIZE; a BUY's
  held quantity is net of commission taken in the base asset; OKX fills (price, size, fee) are read back from the order record.
- Positions live in memory: if the process dies, holdings stay on the exchange unmanaged. The first live run needs a small `--capital`.
- With leverage 1 and `maxPositionSizeUsd` 1200, risk per trade is about $6 (the cap binds, not the 2% rule). Raise `maxPositionSizeUsd` in `src/cli.ts` deliberately.
- Tests use a test-only fake exchange (never reachable from the CLI). UNVERIFIED against the live Binance/OKX APIs: try tiny size or testnet keys first (`TESTNET=1`).

## v1.2.1
- Startup banner shows a masked key (first/last 4 + length) and the exchange host it will use. `OKX_HOST` selects the OKX site. Credentials are stripped of quotes/spaces/CRs. OKX error codes 50119/50111/50113/50105/50110 now print a specific fix.
