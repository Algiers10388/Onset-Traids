// Offline tests: no network, no random data. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoTradingAgent, AgentConfig } from '../src/agent.js';
import { ExchangeClient, MarketDataError, TradeOrderRequest, TradeOrderResult, floorToStep } from '../src/exchange.js';
import { RiskManager, Position } from '../src/risk.js';
import { Candle } from '../src/indicators.js';

function candlesFrom(closes: number[]): Candle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return { timestamp: i * 60000, open: o, high: Math.max(o, c) + 0.05, low: Math.min(o, c) - 0.05, close: c, volume: 50 };
  });
}

// TEST DOUBLE ONLY: stands in for the exchange so logic can be unit-tested offline. It is not a trading mode and
// is not reachable from the CLI. Fills at the reference price +/-0.02% with a 0.06% fee, like a taker market order.
class ScriptedExchange extends ExchangeClient {
  public closes: number[] = Array.from({ length: 100 }, (_, i) => 100 - i * 0.1); // steady decline -> RSI ~ 0
  constructor() { super('BINANCE', { apiKey: 'test', apiSecret: 'test' }); }
  override async fetchCandles(): Promise<Candle[]> { return candlesFrom(this.closes.slice(-100)); }
  override async fetchQuoteBalance(): Promise<number> { return 10000; }
  override async executeOrder(req: TradeOrderRequest): Promise<TradeOrderResult> {
    const ref = req.referencePrice!;
    const qty = req.quantity ?? req.amountUsd / ref;
    const px = ref * (req.side === 'BUY' ? 1.0002 : 0.9998);
    return { success: true, orderId: 'T' + Math.random(), exchange: 'TEST', symbol: req.symbol, side: req.side, executedPrice: px,
      quantity: qty, notionalUsd: qty * px, feeUsd: qty * px * 0.0006, timestamp: Date.now(), isSimulated: true };
  }
  push(price: number) { this.closes.push(price); }
}

const baseCfg = (): AgentConfig => ({
  symbols: ['SOL/USDT'],
  exchange: 'BINANCE',
  strategy: 'RSI_DIVERGENCE',
  leverage: 1,
  capitalCapUsd: 10000,
  pollIntervalMs: 5000,
  risk: { maxPositionSizeUsd: 1200, dailyLossLimitUsd: 250 },
});

test('long: SL < entry < TP, entry is signal price + slippage', async () => {
  const ex = new ScriptedExchange();
  const agent = new CryptoTradingAgent(baseCfg(), ex);
  await agent.evaluateSymbol('SOL/USDT');
  const [pos] = agent.getState().openPositions;
  assert.ok(pos, 'position should open');
  const signalPrice = ex.closes[ex.closes.length - 1];
  assert.ok(Math.abs(pos.entryPrice - signalPrice * 1.0002) < 1e-9);
  assert.ok(pos.stopLossPrice < pos.entryPrice && pos.entryPrice < pos.takeProfitPrice);
});

test('take-profit exit: realized PnL matches prices and fees; treasury reconciles', async () => {
  const ex = new ScriptedExchange();
  const agent = new CryptoTradingAgent(baseCfg(), ex);
  await agent.evaluateSymbol('SOL/USDT');
  const pos = agent.getState().openPositions[0];
  ex.push(pos.takeProfitPrice + 0.5);
  await agent.evaluateSymbol('SOL/USDT');
  const st = agent.getState();
  assert.equal(st.openPositions.length, 0);
  const sell = st.tradeHistory[0];
  assert.equal(sell.action, 'SELL');
  assert.ok(sell.reason.includes('TAKE_PROFIT'));
  assert.ok(sell.realizedPnlUsd! > 0);
  assert.ok(Math.abs(st.treasuryUsd - (10000 + sell.realizedPnlUsd!)) < 1e-6, 'cash must equal start + net PnL');
});

test('stop-loss exit is a loss that scales with the actual price move', async () => {
  const ex = new ScriptedExchange();
  const agent = new CryptoTradingAgent(baseCfg(), ex);
  await agent.evaluateSymbol('SOL/USDT');
  const pos = agent.getState().openPositions[0];
  ex.push(pos.stopLossPrice - 0.3);
  await agent.evaluateSymbol('SOL/USDT');
  const sell = agent.getState().tradeHistory[0];
  assert.ok(sell.reason.includes('STOP_LOSS'));
  assert.ok(sell.realizedPnlUsd! < -5, `loss should reflect the move, got ${sell.realizedPnlUsd}`);
});

test('re-entry cooldown after an exit', async () => {
  let t = 1_700_000_000_000;
  const ex = new ScriptedExchange();
  const agent = new CryptoTradingAgent(baseCfg(), ex, () => t);
  await agent.evaluateSymbol('SOL/USDT');
  ex.push(agent.getState().openPositions[0].stopLossPrice - 0.3);
  await agent.evaluateSymbol('SOL/USDT'); // stopped out
  for (let i = 0; i < 3; i++) ex.push(ex.closes[ex.closes.length - 1] - 0.1);
  await agent.evaluateSymbol('SOL/USDT');
  assert.equal(agent.getState().openPositions.length, 0, 'no instant re-entry');
  t += 121_000;
  await agent.evaluateSymbol('SOL/USDT');
  assert.equal(agent.getState().openPositions.length, 1, 'enters again after cooldown');
});

test('feed outage: throws MarketDataError, agent trades nothing', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
  try {
    const ex = new ExchangeClient('BINANCE', { apiKey: 'x', apiSecret: 'y' });
    await assert.rejects(() => ex.fetchCandles('BTC/USDT'), MarketDataError);
    const agent = new CryptoTradingAgent(baseCfg(), ex);
    assert.equal(await agent.evaluateSymbol('SOL/USDT'), null);
    assert.equal(agent.getState().openPositions.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('lot size: quantities are floored to the exchange step, never rounded up', () => {
  assert.equal(floorToStep(0.123456, 0.0001), 0.1234);
  assert.equal(floorToStep(1.999, 0.01), 1.99);
  assert.equal(floorToStep(0.00099, 0.001), 0);
  assert.equal(floorToStep(0.3, 0.1), 0.3); // float noise must not drop a step
});

test('no credentials: orders fail instead of pretending to fill', async () => {
  const ex = new ExchangeClient('BINANCE', {});
  const r = await ex.executeOrder({ symbol: 'SOL/USDT', side: 'BUY', orderType: 'MARKET', amountUsd: 100, referencePrice: 100 });
  assert.equal(r.success, false);
  assert.match(r.error!, /credentials/i);
});

test('sizing: min stop floor applies to both sizing and the stop price', () => {
  const rm = new RiskManager({ maxPositionSizeUsd: 100000, riskPerTradePercent: 0.1 });
  const s = rm.calculateDynamicPositionSize(10000, 68000, 20 /* tiny 1m ATR */, 5, 70);
  assert.ok(Math.abs(s.stopDistanceUsd - 68000 * 0.005) < 1e-9);
  assert.ok(Math.abs(68000 - s.stopLossPrice - s.stopDistanceUsd) < 1e-9);
  assert.ok(Math.abs(s.actualRiskUsd - s.riskAmountUsd) < 1); // uncapped: risk is what we said it was
});

test('exits: SL/TP use price levels; no leveraged-% override', () => {
  const rm = new RiskManager();
  const pos: Position = {
    id: 'x', symbol: 'BTC/USDT', side: 'LONG', entryPrice: 100, currentPrice: 100, highestPrice: 100,
    marginUsd: 1000, leverage: 5, unrealizedPnlUsd: 0, unrealizedPnlPercent: 0, entryTimestamp: 0, orderId: 'o',
    stopLossPrice: 98, takeProfitPrice: 105,
  };
  assert.equal(rm.checkPositionExit(pos, 99, false, '').shouldExit, false); // -5% on margin, but above the SL level
  assert.equal(rm.checkPositionExit(pos, 97.9, false, '').exitType, 'STOP_LOSS');
  assert.equal(rm.checkPositionExit(pos, 101.5, false, '').shouldExit, false); // +7.5% on margin, below TP level
  assert.equal(rm.checkPositionExit(pos, 105.1, false, '').exitType, 'TAKE_PROFIT');
});

test('circuit breaker: reason is reported and it resets at UTC midnight', () => {
  let t = Date.UTC(2026, 10, 9, 12, 0, 0);
  const rm = new RiskManager({ maxConsecutiveLosses: 4 }, () => t);
  for (let i = 0; i < 4; i++) rm.recordTradeClosed(-2.4);
  const st = rm.getStatus();
  assert.equal(st.isCircuitBreakerTripped, true);
  assert.match(st.tripReason, /consecutive/);
  assert.equal(rm.canOpenPosition(0).allowed, false);
  t = Date.UTC(2026, 10, 10, 0, 0, 1);
  assert.equal(rm.canOpenPosition(0).allowed, true);
});

test('shutdown closes open positions', async () => {
  const ex = new ScriptedExchange();
  const agent = new CryptoTradingAgent(baseCfg(), ex);
  await agent.evaluateSymbol('SOL/USDT');
  assert.equal(agent.getState().openPositions.length, 1);
  await agent.shutdown();
  assert.equal(agent.getState().openPositions.length, 0);
});
