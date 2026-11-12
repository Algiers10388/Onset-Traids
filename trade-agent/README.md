# Autonomous Crypto Trading Agent

High-frequency, precision quantitative trading agent powered by **MACD (12, 26, 9)**, **Relative Strength Index (RSI 14)**, **Bollinger Bands (20, 2)**, **Regular Divergence Detection**, and **Multi-Factor Confluence Scoring (0–100%)**.

Supports:
- **Live execution only**: real spot market orders on Binance or OKX. Sizing comes from your real free USDT balance (optionally capped with `--capital=`). There is no paper, dry-run or demo mode.
- **Live Authenticated Execution**: Real HMAC-SHA256 signed order routing to **Binance**, **OKX**, **Coinbase**, **Bybit**, and **Kraken**.
- **Dynamic Risk Management**: Dynamic fractional Kelly sizing, daily loss circuit breakers, stop-loss, take-profit targets, and peak-tracking trailing stops.

---

## Quick Start

### 1. Termux on Android (`aarch64-linux-android`)
```bash
cd trade-agent
chmod +x run_termux.sh
./run_termux.sh
```

### 2. WSL or Linux
```bash
cd trade-agent
chmod +x run_wsl.sh
./run_wsl.sh
```

### 3. Windows PowerShell
```powershell
Set-Location trade-agent
.\run_powershell.ps1
```

---

## Strategy Options
- `--strategy=TRIPLE_CONFLUENCE_PRO`: Demands multi-indicator confluence score $\ge 68\%$, positive/expanding MACD histogram, and RSI discipline.
- `--strategy=BOLLINGER_MACD_SQUEEZE`: Enters when Bollinger Bandwidth is in the lowest ~20% of its own recent range and the MACD histogram is positive and expanding.
- `--strategy=MACD_CROSSOVER`: Pure momentum trend following on fast/slow EMA cross above signal.
- `--strategy=RSI_DIVERGENCE`: Mean reversion on confirmed regular bullish divergence (Price Lower Low with RSI Higher Low).

## CLI Arguments
```bash
# Run live (requires API_KEY / API_SECRET in .env)
npx tsx src/cli.ts --exchange=BINANCE --symbols=BTC/USDT,ETH/USDT --capital=500

# Offline unit tests (use a test-only fake exchange; no orders are ever sent)
npm test
```
