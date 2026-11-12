// ==============================================================================
// Autonomous Crypto Trading Agent: Core Orchestrator & Signal Evaluator
// ==============================================================================

import { ExchangeClient, MarketDataError, SupportedExchange, TradeOrderResult } from './exchange.js';
import { evaluateSnapshot, IndicatorSnapshot } from './indicators.js';
import { Position, RiskConfig, RiskManager } from './risk.js';

export type StrategyTrigger =
  | 'TRIPLE_CONFLUENCE_PRO'
  | 'BOLLINGER_MACD_SQUEEZE'
  | 'MACD_CROSSOVER'
  | 'RSI_DIVERGENCE';

export interface AgentConfig {
  symbols: string[];
  exchange: SupportedExchange;
  strategy: StrategyTrigger;
  leverage: number;
  /** Optional ceiling on the capital the agent may use. The agent sizes from min(real USDT balance, cap). */
  capitalCapUsd?: number;
  pollIntervalMs: number;
  risk: Partial<RiskConfig>;
  /** Minimum time before re-entering a symbol after closing it. Default 120s. */
  reentryCooldownMs?: number;
}

export interface TradeLog {
  id: string;
  timestamp: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  price: number;
  amountUsd: number;
  reason: string;
  realizedPnlUsd?: number;
  feeUsd?: number;
  confluenceScore?: number;
}

export class CryptoTradingAgent {
  private config: AgentConfig;
  private exchange: ExchangeClient;
  private risk: RiskManager;
  private treasuryUsd: number;
  private openPositions: Map<string, Position> = new Map();
  private tradeHistory: TradeLog[] = [];
  private lastExitAt: Map<string, number> = new Map();
  private lastFeedWarnAt: Map<string, number> = new Map();
  private idCounter = 0;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private now: () => number;

  constructor(config: AgentConfig, exchangeClient: ExchangeClient, now: () => number = Date.now) {
    this.config = config;
    this.now = now;
    this.treasuryUsd = config.capitalCapUsd ?? 0; // replaced by the real account balance in start()
    this.exchange = exchangeClient;
    this.risk = new RiskManager(config.risk, now);
  }

  public async start(onTick?: (snapshotMap: Map<string, IndicatorSnapshot>) => void): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[AGENT START] Initializing Autonomous Crypto Trading Agent on ${this.config.symbols.join(', ')}...`);
    console.log(`[STRATEGY] ${this.config.strategy} | LIVE CAPITAL on ${this.config.exchange}`);

    // Size from the REAL account, never from an invented balance.
    try {
      const balance = await this.exchange.fetchQuoteBalance('USDT');
      const cap = this.config.capitalCapUsd;
      this.treasuryUsd = cap && cap > 0 ? Math.min(balance, cap) : balance;
      console.log(`[CAPITAL] Free USDT on ${this.config.exchange}: $${balance.toFixed(2)} | agent capital: $${this.treasuryUsd.toFixed(2)}`);
      if (this.treasuryUsd < 25) throw new Error('Not enough USDT to trade (need at least $25 of agent capital).');
    } catch (e: any) {
      this.isRunning = false;
      throw new Error(`Cannot start: ${e?.message || e}`);
    }

    const runLoop = async () => {
      if (!this.isRunning) return;
      try {
        const snapshots = new Map<string, IndicatorSnapshot>();
        for (const symbol of this.config.symbols) {
          const snap = await this.evaluateSymbol(symbol);
          if (snap) snapshots.set(symbol, snap);
        }
        if (onTick) onTick(snapshots);
      } catch (err: any) {
        console.error('[AGENT LOOP ERROR]', err.message);
      } finally {
        if (this.isRunning) {
          this.timer = setTimeout(runLoop, this.config.pollIntervalMs);
        }
      }
    };

    await runLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    console.log('[AGENT STOPPED]');
  }

  /** Close every open position at the last known price, then stop. Used on Ctrl+C. */
  public async shutdown(): Promise<void> {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    for (const [id, pos] of Array.from(this.openPositions.entries())) {
      await this.closePosition(id, 'SHUTDOWN', 'Agent shutdown (manual halt)', pos.currentPrice);
    }
    console.log('[AGENT STOPPED]');
  }

  public async evaluateSymbol(symbol: string): Promise<IndicatorSnapshot | null> {
    let candles;
    try {
      candles = await this.exchange.fetchCandles(symbol, '1m', 100);
    } catch (e: any) {
      // Never trade on missing data. Warn at most once every 30s per symbol.
      const t = this.now();
      if (t - (this.lastFeedWarnAt.get(symbol) ?? 0) > 30_000) {
        this.lastFeedWarnAt.set(symbol, t);
        const msg = e instanceof MarketDataError ? e.message : `Data error: ${e?.message || e}`;
        console.warn(`[DATA FEED DOWN] ${symbol}: ${msg} - skipping (no trades without real data)`);
      }
      return null;
    }
    if (!candles || candles.length < 26) return null;

    const snap = evaluateSnapshot(candles);
    const currentPrice = snap.price;

    // 1. Manage active positions for this symbol (all numbers use this one price)
    for (const [id, pos] of Array.from(this.openPositions.entries())) {
      if (pos.symbol !== symbol) continue;

      pos.currentPrice = currentPrice;
      pos.highestPrice = Math.max(pos.highestPrice, currentPrice);

      const qty = pos.quantity ?? (pos.marginUsd * pos.leverage) / pos.entryPrice;
      pos.unrealizedPnlUsd = (currentPrice - pos.entryPrice) * qty;
      pos.unrealizedPnlPercent = (pos.unrealizedPnlUsd / pos.marginUsd) * 100;

      const isSellSignal = snap.confluence.score <= 35 || snap.macd.isBearishCross;
      const sellReason = snap.macd.isBearishCross
        ? 'MACD Death Cross Bearish Reversal'
        : `Confluence Downside (${snap.confluence.score}%)`;

      const exitCheck = this.risk.checkPositionExit(pos, currentPrice, isSellSignal, sellReason);
      if (exitCheck.shouldExit) {
        await this.closePosition(id, exitCheck.exitType || 'TECHNICAL_EXIT', exitCheck.reason || 'Exit Trigger', currentPrice);
      }
    }

    // 2. Entry conditions
    const cooledDown = this.now() - (this.lastExitAt.get(symbol) ?? 0) >= (this.config.reentryCooldownMs ?? 120_000);
    const canOpen = this.risk.canOpenPosition(this.openPositions.size);
    if (canOpen.allowed && cooledDown && !this.hasPositionForSymbol(symbol)) {
      const entryCheck = this.checkEntrySignal(snap);
      if (entryCheck.shouldEnter) {
        await this.openPosition(symbol, snap, entryCheck.reason);
      }
    }

    return snap;
  }

  private checkEntrySignal(snap: IndicatorSnapshot): { shouldEnter: boolean; reason: string } {
    const { macd, rsi, bollinger, confluence } = snap;

    switch (this.config.strategy) {
      case 'TRIPLE_CONFLUENCE_PRO':
        if (confluence.score >= 68 && macd.histogram > 0 && rsi < 58) {
          return {
            shouldEnter: true,
            reason: `Triple Confluence Bullish (${confluence.score}%): MACD Hist +${macd.histogram.toFixed(2)}, RSI ${rsi.toFixed(1)}, BB %B ${bollinger.percentB.toFixed(2)}`,
          };
        }
        break;

      case 'BOLLINGER_MACD_SQUEEZE':
        if (bollinger.isSqueeze && macd.histogram > 0 && macd.isHistogramExpanding) {
          return {
            shouldEnter: true,
            reason: `Bollinger Squeeze + MACD Expansion: BW ${(bollinger.bandwidth * 100).toFixed(2)}%, MACD Hist +${macd.histogram.toFixed(2)} expanding`,
          };
        }
        break;

      case 'MACD_CROSSOVER':
        if (macd.isBullishCross || (macd.histogram > 0 && macd.isHistogramExpanding && rsi < 62)) {
          return {
            shouldEnter: true,
            reason: `MACD Golden Cross: MACD (${macd.macd.toFixed(2)}) crossed Signal (${macd.signal.toFixed(2)})`,
          };
        }
        break;

      case 'RSI_DIVERGENCE':
        if (rsi <= 32 || confluence.factors.some((f) => f.includes('Bullish Divergence'))) {
          return {
            shouldEnter: true,
            reason: `RSI Mean Reversion: RSI ${rsi.toFixed(1)} oversold + positive MACD curve`,
          };
        }
        break;
    }

    return { shouldEnter: false, reason: '' };
  }

  private async openPosition(symbol: string, snap: IndicatorSnapshot, reason: string): Promise<void> {
    const lev = Math.min(this.config.leverage, this.risk.getConfig().maxLeverage);
    const sizing = this.risk.calculateDynamicPositionSize(this.treasuryUsd, snap.price, snap.atr, lev, snap.confluence.score);
    const marginUsd = sizing.margin;
    const estFee = sizing.notional * 0.0006;
    if (this.treasuryUsd < marginUsd + estFee) return;

    const orderRes: TradeOrderResult = await this.exchange.executeOrder({
      symbol,
      side: 'BUY',
      orderType: 'MARKET',
      amountUsd: marginUsd,
      leverage: lev,
      referencePrice: snap.price,
    });

    if (!orderRes.success) {
      console.warn(`[ORDER FAILED] ${symbol} BUY error: ${orderRes.error}`);
      return;
    }

    // Re-base SL/TP on the actual fill so a LONG always has SL < entry < TP.
    const fill = orderRes.executedPrice;
    const shift = fill - snap.price;
    const stopLossPrice = sizing.stopLossPrice + shift;
    const takeProfitPrice = sizing.takeProfitPrice + shift;

    const posId = `POS_${this.now().toString(36)}_${++this.idCounter}`;
    const newPos: Position = {
      id: posId,
      symbol,
      side: 'LONG',
      entryPrice: fill,
      currentPrice: snap.price,
      highestPrice: Math.max(fill, snap.price),
      marginUsd,
      leverage: lev,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      entryTimestamp: this.now(),
      orderId: orderRes.orderId,
      stopLossPrice,
      takeProfitPrice,
      atrAtEntry: snap.atr,
      isDynamicSized: true,
      riskRewardRatio: this.risk.getConfig().riskRewardRatio,
      stopLossDistanceUsd: sizing.stopDistanceUsd,
      targetProfitUsd: (takeProfitPrice - fill) * orderRes.quantity,
      quantity: orderRes.quantity,
      entryFeeUsd: orderRes.feeUsd,
    };

    this.openPositions.set(posId, newPos);
    this.treasuryUsd -= marginUsd + orderRes.feeUsd;

    this.tradeHistory.unshift({
      id: posId,
      timestamp: this.now(),
      symbol,
      action: 'BUY',
      price: fill,
      amountUsd: orderRes.notionalUsd,
      feeUsd: orderRes.feeUsd,
      reason: `${reason} [Regime: ${sizing.volatilityRegime} | ATR: $${snap.atr.toFixed(2)} | SL: $${stopLossPrice.toFixed(2)} | TP: $${takeProfitPrice.toFixed(2)}]`,
      confluenceScore: snap.confluence.score,
    });

    console.log(
      `[ENTRY EXECUTED] ${symbol} LONG @ $${fill.toFixed(2)} | ` +
      `Margin: $${marginUsd.toFixed(2)} (${lev}x, notional $${orderRes.notionalUsd.toFixed(0)}) | ` +
      `Risk at stop: $${sizing.actualRiskUsd.toFixed(2)} | Fee: $${orderRes.feeUsd.toFixed(2)} | ` +
      `Volatility Regime: ${sizing.volatilityRegime} (ATR $${snap.atr.toFixed(2)}) | ` +
      `Targets: SL $${stopLossPrice.toFixed(2)} / TP $${takeProfitPrice.toFixed(2)} | ${reason}`
    );
  }

  private async closePosition(posId: string, exitType: string, reason: string, referencePrice: number): Promise<void> {
    const pos = this.openPositions.get(posId);
    if (!pos) return;

    const qty = pos.quantity ?? (pos.marginUsd * pos.leverage) / pos.entryPrice;
    const orderRes = await this.exchange.executeOrder({
      symbol: pos.symbol,
      side: 'SELL',
      orderType: 'MARKET',
      amountUsd: pos.marginUsd,
      leverage: pos.leverage,
      quantity: qty,
      referencePrice,
    });

    // If the exit order failed, the position is STILL OPEN. Do not book a fake close.
    if (!orderRes.success) {
      console.warn(`[ORDER FAILED] ${pos.symbol} SELL error: ${orderRes.error} - position remains open`);
      return;
    }

    const exitPrice = orderRes.executedPrice;
    const grossPnlUsd = (exitPrice - pos.entryPrice) * qty;
    const exitFee = orderRes.feeUsd;
    const netPnlUsd = grossPnlUsd - (pos.entryFeeUsd ?? 0) - exitFee;
    const netPct = (netPnlUsd / pos.marginUsd) * 100;

    this.treasuryUsd += pos.marginUsd + grossPnlUsd - exitFee; // entry fee was already paid on open
    this.risk.recordTradeClosed(netPnlUsd);
    this.openPositions.delete(posId);
    this.lastExitAt.set(pos.symbol, this.now());

    this.tradeHistory.unshift({
      id: `EXIT_${this.now().toString(36)}_${++this.idCounter}`,
      timestamp: this.now(),
      symbol: pos.symbol,
      action: 'SELL',
      price: exitPrice,
      amountUsd: orderRes.notionalUsd,
      feeUsd: exitFee,
      reason: `[${exitType}] ${reason}`,
      realizedPnlUsd: netPnlUsd,
    });

    const sign = netPnlUsd >= 0 ? '+' : '-';
    console.log(
      `[EXIT EXECUTED] ${pos.symbol} CLOSED @ $${exitPrice.toFixed(2)} (entry $${pos.entryPrice.toFixed(2)}) | ` +
      `Net PnL: ${sign}$${Math.abs(netPnlUsd).toFixed(2)} (${sign}${Math.abs(netPct).toFixed(2)}% on margin, fees $${((pos.entryFeeUsd ?? 0) + exitFee).toFixed(2)}) | ${reason}`
    );
  }

  private hasPositionForSymbol(symbol: string): boolean {
    for (const pos of this.openPositions.values()) {
      if (pos.symbol === symbol) return true;
    }
    return false;
  }

  public resetCircuitBreaker(): void {
    this.risk.resetCircuitBreaker();
    console.log('[RISK ENGINE] Circuit Breaker has been reset.');
  }

  public getState() {
    const openValue = Array.from(this.openPositions.values()).reduce((s, p) => s + p.marginUsd + p.unrealizedPnlUsd, 0);
    return {
      /** Free cash (margin currently locked in positions is NOT included). */
      treasuryUsd: this.treasuryUsd,
      /** Cash + locked margin + unrealized PnL. */
      equityUsd: this.treasuryUsd + openValue,
      dataSource: this.exchange.lastSource,
      openPositions: Array.from(this.openPositions.values()),
      tradeHistory: this.tradeHistory.slice(0, 30),
      riskStatus: this.risk.getStatus(),
    };
  }
}
