// ==============================================================================
// Autonomous Crypto Trading Agent: High-Performance CLI Dashboard & Risk Engine
// ==============================================================================

import 'dotenv/config';
import { CryptoTradingAgent, AgentConfig, StrategyTrigger } from './agent.js';
import { ExchangeClient, SupportedExchange } from './exchange.js';
import { IndicatorSnapshot } from './indicators.js';

const args = process.argv.slice(2);
const argVal = (name: string) => args.find((a: string) => a.startsWith(`--${name}=`))?.split('=')[1];

const strategyArg = (argVal('strategy') as StrategyTrigger) || 'TRIPLE_CONFLUENCE_PRO';
const exchangeArg = (argVal('exchange')?.toUpperCase() || process.env.EXCHANGE?.toUpperCase() || 'BINANCE') as SupportedExchange;
const symbolsArg = argVal('symbols')?.split(',') || ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
const capitalArg = argVal('capital') ? parseFloat(argVal('capital') as string) : undefined;

const VALID_STRATEGIES = ['TRIPLE_CONFLUENCE_PRO', 'BOLLINGER_MACD_SQUEEZE', 'MACD_CROSSOVER', 'RSI_DIVERGENCE'];

function fail(msg: string): never {
  console.error(`\n[CONFIG ERROR] ${msg}\n`);
  process.exit(1);
}

// This agent trades REAL money only. There is no paper, dry-run or demo mode.
// Old flags must fail loudly: silently ignoring `--dry-run` would start LIVE trading for someone expecting a safe mode.
for (const removed of ['--dry-run', '--demo', '--paper', '--simulate']) {
  if (args.includes(removed)) fail(`${removed} has been removed: this agent trades live only.`);
}
if (args.includes('--backtest')) fail('--backtest is not implemented in this build.');
if (!VALID_STRATEGIES.includes(strategyArg)) fail(`Unknown --strategy=${strategyArg}. Valid: ${VALID_STRATEGIES.join(', ')}`);
if (exchangeArg !== 'BINANCE' && exchangeArg !== 'OKX') fail(`Live execution supports BINANCE or OKX only (got ${exchangeArg}). Pass --exchange=BINANCE.`);
if (!process.env.API_KEY || !process.env.API_SECRET) fail('API_KEY and API_SECRET are required (environment or .env). This agent only trades live.');
if (exchangeArg === 'OKX' && !process.env.API_PASSPHRASE) fail('OKX requires API_PASSPHRASE.');
if (argVal('leverage') && parseInt(argVal('leverage') as string, 10) !== 1) fail('Execution is SPOT only, so leverage is always 1. Remove --leverage.');
if (capitalArg !== undefined && !(capitalArg > 0)) fail('--capital must be a positive number of USDT.');

const riskCfg = {
  maxPositionSizeUsd: 1200,
  dailyLossLimitUsd: 250,
  stopLossPercent: 2.5,
  takeProfitPercent: 6.25,
  trailingStopPercent: 1.8,
  trailingStopEnabled: true,
  dynamicPositionSizing: true,
  riskPerTradePercent: 2.0,
  atrMultiplier: 2.0,
  takeProfitType: 'RISK_REWARD_RATIO' as const,
  riskRewardRatio: 2.5,
  minStopDistancePercent: 0.5,
  maxConsecutiveLosses: 4,
};

const agentConfig: AgentConfig = {
  symbols: symbolsArg,
  exchange: exchangeArg,
  strategy: strategyArg,
  leverage: 1,
  capitalCapUsd: capitalArg,
  pollIntervalMs: 5000,
  risk: riskCfg,
};

console.clear();
console.log('='.repeat(80));
console.log('   QUANTITATIVE CRYPTO TRADING AGENT - ADVANCED RISK & VOLATILITY ENGINE');
console.log('='.repeat(80));
console.log(` Mode:        \x1b[31m[LIVE REAL CAPITAL - SPOT]\x1b[0m`);
console.log(` Data feed:   Real market data (Binance mirror -> Binance -> Binance.US -> OKX -> Bybit)`);
console.log(` Exchange:    ${agentConfig.exchange}${process.env.TESTNET === '1' ? ' (TESTNET keys)' : ''} | capital: ${capitalArg ? `min(balance, $${capitalArg})` : 'full free USDT balance'}`);
console.log(` Strategy:    ${strategyArg}`);
console.log(` Pairs:       ${symbolsArg.join(', ')}`);
console.log(` Leverage:    none (spot)`);
console.log(` Risk Engine: ATR sizing (${riskCfg.atrMultiplier}x ATR, min stop ${riskCfg.minStopDistancePercent}%) | ${riskCfg.riskPerTradePercent}% risk/trade`);
console.log(` Target R:R:  ${riskCfg.riskRewardRatio}:1 | Trailing Stop: ${riskCfg.trailingStopPercent}% (on margin) from peak`);
console.log(` Protection:  Daily loss breaker ($${riskCfg.dailyLossLimitUsd}) + ${riskCfg.maxConsecutiveLosses} consecutive losses | resets 00:00 UTC`);
console.log(` Indicators:  MACD (12,26,9) | RSI (14) | Bollinger Bands (20,2) | ATR (14) | Confluence`);
console.log('='.repeat(80));
console.log(' Press Ctrl+C to halt the agent and SELL open positions at market.');
console.log(' Positions are tracked in memory only: if the process dies, holdings stay on the exchange and are NOT managed on restart.\n');

// .env values often arrive with quotes, spaces or Windows line endings; none of those belong in a key.
const clean = (v?: string) => v?.trim().replace(/^["']+|["']+$/g, '').trim();
const exchangeClient = new ExchangeClient(agentConfig.exchange, {
  apiKey: clean(process.env.API_KEY),
  apiSecret: clean(process.env.API_SECRET),
  passphrase: clean(process.env.API_PASSPHRASE),
  isTestnet: clean(process.env.TESTNET) === '1',
  okxHost: clean(process.env.OKX_HOST),
});
console.log(` Connection:  ${exchangeClient.describeConnection()}`);
if (agentConfig.exchange === 'OKX' && (clean(process.env.API_KEY) || '').length !== 36) {
  console.warn(' [WARN] OKX API keys are normally 36 characters (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Re-copy API_KEY from the OKX key page.');
}


const agent = new CryptoTradingAgent(agentConfig, exchangeClient);

const n = (v: number, d = 2) => (Math.abs(v) >= 1 ? v.toFixed(d) : v.toFixed(4));
let tickCount = 0;

agent
  .start((snapshots: Map<string, IndicatorSnapshot>) => {
    tickCount++;
    const state = agent.getState();
    const timeStr = new Date().toLocaleTimeString();
    const rs = state.riskStatus;

    const cbStatus = rs.isCircuitBreakerTripped
      ? `\x1b[41m\x1b[37m[CIRCUIT BREAKER: TRIPPED - ${rs.tripReason}]\x1b[0m`
      : '\x1b[32m[CIRCUIT BREAKER: ARMED]\x1b[0m';

    console.log(
      `\n--- [TICK #${tickCount} @ ${timeStr}] ` +
      `Equity: $${state.equityUsd.toFixed(2)} (cash $${state.treasuryUsd.toFixed(2)}) | ` +
      `Positions: ${state.openPositions.length} | ` +
      `Daily Loss: $${rs.dailyRealizedLossUsd.toFixed(2)} / $${rs.dailyLossLimitUsd} | ` +
      `Feed: ${state.dataSource} | ${cbStatus} ---`
    );

    for (const [symbol, snap] of snapshots.entries()) {
      const { price, rsi, macd, confluence, atr, atrPercent } = snap;
      const scoreColor = confluence.score >= 70 ? '\x1b[32m' : confluence.score <= 35 ? '\x1b[31m' : '\x1b[33m';
      const atrDisplay = atr ? `ATR: $${atr.toFixed(2)} (${(atrPercent || 0).toFixed(2)}%)` : 'ATR: N/A';

      console.log(
        ` ${symbol.padEnd(9)} | $${price.toFixed(2).padStart(9)} | ` +
        `RSI: ${rsi.toFixed(1).padStart(4)} | ` +
        `MACD Hist: ${(macd.histogram >= 0 ? '+' : '') + n(macd.histogram).padStart(7)} | ` +
        `${atrDisplay.padEnd(24)} | ` +
        `Confluence: ${scoreColor}${confluence.score}% [${confluence.verdict}]\x1b[0m`
      );

      if (confluence.factors.length > 0 && (confluence.score >= 65 || confluence.score <= 35)) {
        console.log(`   └─ Drivers: ${confluence.factors.slice(0, 2).join(' | ')}`);
      }
    }

    if (state.openPositions.length > 0) {
      console.log('\n Active Positions & Risk Controls:');
      for (const p of state.openPositions) {
        const pnlColor = p.unrealizedPnlPercent >= 0 ? '\x1b[32m' : '\x1b[31m';
        const pnlStr = `${p.unrealizedPnlPercent >= 0 ? '+' : ''}${p.unrealizedPnlPercent.toFixed(2)}% ($${p.unrealizedPnlUsd.toFixed(2)})`;
        const tpStr = p.takeProfitPrice ? `TP: $${p.takeProfitPrice.toFixed(2)}` : 'TP: N/A';
        const slStr = p.stopLossPrice ? `SL: $${p.stopLossPrice.toFixed(2)}` : 'SL: N/A';
        const dynamicBadge = p.isDynamicSized ? '[ATR Dynamic]' : '[Static]';

        console.log(
          `   • [${p.symbol}] ${dynamicBadge} Entry: $${p.entryPrice.toFixed(2)} | ` +
          `Current: $${p.currentPrice.toFixed(2)} | Peak: $${p.highestPrice.toFixed(2)} | ` +
          `PnL (on margin, before exit fee): ${pnlColor}${pnlStr}\x1b[0m | ${tpStr} | ${slStr}`
        );
      }
    }
  })
  .catch((e: any) => {
    console.error('[FATAL]', e?.message || e);
    process.exit(1);
  });

let shuttingDown = false;
process.on('SIGINT', async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[SHUTDOWN] Closing open positions and terminating agent...');
  try {
    await agent.shutdown();
  } finally {
    process.exit(0);
  }
});
