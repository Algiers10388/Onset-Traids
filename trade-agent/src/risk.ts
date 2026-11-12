// ==============================================================================
// Autonomous Crypto Trading Agent: Advanced Risk Management & Sizing Engine
// Enforces: ATR Dynamic Position Sizing, TP/SL Price Targets, Trailing Stops,
//           Risk-Reward Expectancy Ratios, and Daily Loss Circuit Breakers
// ==============================================================================

export interface RiskConfig {
  maxPositionSizeUsd: number;
  maxLeverage: number;
  dailyLossLimitUsd: number;
  stopLossPercent: number; // fallback % stop (leveraged) when a position has no price level
  takeProfitPercent: number; // fallback % target (leveraged) when a position has no price level
  trailingStopPercent: number;
  trailingStopEnabled: boolean;
  maxOpenPositions: number;
  dynamicPositionSizing: boolean;
  riskPerTradePercent: number;
  atrMultiplier: number;
  takeProfitType: 'FIXED_PERCENT' | 'RISK_REWARD_RATIO';
  riskRewardRatio: number;
  /** Floor on the stop distance as % of price, so a 1m ATR of 0.05% can't create a 0.1% stop. */
  minStopDistancePercent: number;
  /** Trip the circuit breaker after this many losing trades in a row. 0 disables. */
  maxConsecutiveLosses: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  marginUsd: number;
  leverage: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercent: number;
  entryTimestamp: number;
  orderId: string;
  stopLossPrice: number;
  takeProfitPrice: number;
  atrAtEntry?: number;
  isDynamicSized?: boolean;
  riskRewardRatio?: number;
  stopLossDistanceUsd?: number;
  targetProfitUsd?: number;
  /** Base-asset quantity actually bought (used to sell exactly what we hold). */
  quantity?: number;
  /** Fee paid on entry; deducted from realized PnL on close. */
  entryFeeUsd?: number;
}

export interface PositionSizingResult {
  margin: number;
  notional: number;
  riskAmountUsd: number;
  /** Actual $ lost if the stop is hit (notional x stop fraction). May be < riskAmountUsd when margin is capped. */
  actualRiskUsd: number;
  stopDistanceUsd: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  effectiveStopPct: number;
  effectiveTpPct: number;
  volatilityRegime: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
}

const utcDayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export class RiskManager {
  private config: RiskConfig;
  private dailyRealizedLossUsd = 0;
  private consecutiveLosses = 0;
  private isCircuitBreakerTripped = false;
  private tripReason = '';
  private dayKey = utcDayKey();
  private now: () => number;

  constructor(config?: Partial<RiskConfig>, now: () => number = Date.now) {
    this.now = now;
    this.dayKey = utcDayKey(now());
    this.config = {
      maxPositionSizeUsd: 1000,
      maxLeverage: 5,
      dailyLossLimitUsd: 250,
      stopLossPercent: 2.5,
      takeProfitPercent: 6.0,
      trailingStopPercent: 1.8,
      trailingStopEnabled: true,
      maxOpenPositions: 3,
      dynamicPositionSizing: true,
      riskPerTradePercent: 2.0,
      atrMultiplier: 2.0,
      takeProfitType: 'RISK_REWARD_RATIO',
      riskRewardRatio: 2.5,
      minStopDistancePercent: 0.5,
      maxConsecutiveLosses: 4,
      ...config,
    };
  }

  /** Daily counters reset at 00:00 UTC. Breaker trips from the previous day clear too. */
  private rollDay(): void {
    const key = utcDayKey(this.now());
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dailyRealizedLossUsd = 0;
      this.consecutiveLosses = 0;
      this.isCircuitBreakerTripped = false;
      this.tripReason = '';
    }
  }

  private trip(reason: string): void {
    this.isCircuitBreakerTripped = true;
    this.tripReason = reason;
  }

  public canOpenPosition(currentPositionsCount: number): { allowed: boolean; reason?: string } {
    this.rollDay();
    if (this.isCircuitBreakerTripped) {
      return { allowed: false, reason: `Circuit Breaker Active: ${this.tripReason}` };
    }
    if (this.dailyRealizedLossUsd >= this.config.dailyLossLimitUsd) {
      this.trip(`daily loss limit ($${this.config.dailyLossLimitUsd}) reached`);
      return { allowed: false, reason: `Daily Loss Limit ($${this.config.dailyLossLimitUsd}) reached` };
    }
    if (currentPositionsCount >= this.config.maxOpenPositions) {
      return { allowed: false, reason: `Max Open Positions limit (${this.config.maxOpenPositions}) reached` };
    }
    return { allowed: true };
  }

  /**
   * Dynamic Position Sizing adjusting trade volume based on ATR volatility:
   * StopDistance   = max(ATR * atrMultiplier, price * minStopDistancePercent)
   * RiskAmount     = Cash * (RiskPerTradePercent / 100) * confidenceScale
   * Notional       = RiskAmount / (StopDistance / Price)
   * Margin         = Notional / Leverage   (then capped by maxPositionSizeUsd / 35% of cash)
   *
   * The SAME stop distance is used for sizing and for the stop-loss price, so the
   * stated risk matches what is actually lost when the stop is hit.
   */
  public calculateDynamicPositionSize(
    treasuryBalanceUsd: number,
    currentPrice: number,
    atr: number,
    leverage: number,
    confidenceScore = 70
  ): PositionSizingResult {
    const safePrice = Math.max(0.0001, currentPrice);
    const safeAtr = atr > 0 ? atr : safePrice * 0.02;
    const atrMult = this.config.atrMultiplier || 2.0;
    const minStop = safePrice * (this.config.minStopDistancePercent / 100);
    const stopDistanceUsd = Math.max(safeAtr * atrMult, minStop);

    const atrPct = (safeAtr / safePrice) * 100;
    let volatilityRegime: PositionSizingResult['volatilityRegime'] = 'NORMAL';
    if (atrPct < 0.9) volatilityRegime = 'LOW';
    else if (atrPct <= 2.2) volatilityRegime = 'NORMAL';
    else if (atrPct <= 4.0) volatilityRegime = 'ELEVATED';
    else volatilityRegime = 'EXTREME';

    const riskPct = this.config.riskPerTradePercent || 2.0;
    const confidenceScale = Math.min(1.25, Math.max(0.7, confidenceScore / 70));
    const riskAmountUsd = Math.max(10, treasuryBalanceUsd * (riskPct / 100) * confidenceScale);

    let boundedMargin: number;
    let effectiveStopPct: number;
    let effectiveTpPct: number;
    let stopLossPrice: number;
    let takeProfitPrice: number;
    const lev = Math.max(1, leverage);

    if (this.config.dynamicPositionSizing) {
      const stopFraction = stopDistanceUsd / safePrice;
      const rawMargin = riskAmountUsd / stopFraction / lev;
      const maxAllowedMargin = Math.min(this.config.maxPositionSizeUsd, Math.max(25, treasuryBalanceUsd * 0.35));
      boundedMargin = Math.max(25, Math.min(maxAllowedMargin, Math.round(rawMargin * 100) / 100));

      effectiveStopPct = stopFraction * 100 * lev;
      stopLossPrice = safePrice - stopDistanceUsd;
      if (this.config.takeProfitType === 'RISK_REWARD_RATIO') {
        const rr = this.config.riskRewardRatio || 2.5;
        effectiveTpPct = effectiveStopPct * rr;
        takeProfitPrice = safePrice + stopDistanceUsd * rr;
      } else {
        effectiveTpPct = this.config.takeProfitPercent;
        takeProfitPrice = safePrice * (1 + this.config.takeProfitPercent / (100 * lev));
      }
    } else {
      const fixedRisk = treasuryBalanceUsd * 0.05;
      boundedMargin = Math.min(this.config.maxPositionSizeUsd, Math.max(25, Math.round(fixedRisk)));
      effectiveStopPct = this.config.stopLossPercent;
      effectiveTpPct = this.config.takeProfitPercent;
      stopLossPrice = safePrice * (1 - effectiveStopPct / (100 * lev));
      takeProfitPrice = safePrice * (1 + effectiveTpPct / (100 * lev));
    }

    const notional = boundedMargin * lev;
    return {
      margin: boundedMargin,
      notional,
      riskAmountUsd,
      actualRiskUsd: notional * (Math.abs(safePrice - stopLossPrice) / safePrice),
      stopDistanceUsd,
      stopLossPrice,
      takeProfitPrice,
      effectiveStopPct,
      effectiveTpPct,
      volatilityRegime,
    };
  }

  public calculatePositionSize(treasuryBalanceUsd: number, confidenceScore: number): number {
    const scoreFactor = Math.max(0.5, confidenceScore / 70);
    const targetRisk = treasuryBalanceUsd * 0.03 * scoreFactor;
    return Math.min(this.config.maxPositionSizeUsd, Math.max(25, Math.round(targetRisk)));
  }

  /** realizedPnlUsd must be NET of fees. */
  public recordTradeClosed(realizedPnlUsd: number): void {
    this.rollDay();
    if (realizedPnlUsd < 0) {
      this.dailyRealizedLossUsd += Math.abs(realizedPnlUsd);
      this.consecutiveLosses++;
      if (this.dailyRealizedLossUsd >= this.config.dailyLossLimitUsd) {
        this.trip(`daily loss limit ($${this.config.dailyLossLimitUsd}) reached`);
      } else if (this.config.maxConsecutiveLosses > 0 && this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this.trip(`${this.consecutiveLosses} consecutive losing trades (limit ${this.config.maxConsecutiveLosses})`);
      }
    } else {
      this.consecutiveLosses = 0;
    }
  }

  public resetCircuitBreaker(): void {
    this.isCircuitBreakerTripped = false;
    this.tripReason = '';
    this.dailyRealizedLossUsd = 0;
    this.consecutiveLosses = 0;
  }

  public checkPositionExit(
    pos: Position,
    currentPrice: number,
    isSellSignal: boolean,
    sellReason: string
  ): { shouldExit: boolean; exitType?: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'TECHNICAL_EXIT'; reason?: string } {
    const rawPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const leveragedPercent = rawPercent * pos.leverage;

    // 1. Stop-loss: price level is authoritative; % stop is only a fallback for positions without one.
    const hasSlLevel = pos.stopLossPrice > 0;
    const slHit = hasSlLevel ? currentPrice <= pos.stopLossPrice : leveragedPercent <= -this.config.stopLossPercent;
    if (slHit) {
      return {
        shouldExit: true,
        exitType: 'STOP_LOSS',
        reason: hasSlLevel
          ? `Stop-Loss ($${pos.stopLossPrice.toFixed(2)}) hit @ $${currentPrice.toFixed(2)} (${leveragedPercent.toFixed(2)}% on margin)`
          : `Stop-Loss (-${this.config.stopLossPercent}%) hit @ $${currentPrice.toFixed(2)}`,
      };
    }

    // 2. Take-profit: same rule.
    const hasTpLevel = pos.takeProfitPrice > 0;
    const tpHit = hasTpLevel ? currentPrice >= pos.takeProfitPrice : leveragedPercent >= this.config.takeProfitPercent;
    if (tpHit) {
      return {
        shouldExit: true,
        exitType: 'TAKE_PROFIT',
        reason: hasTpLevel
          ? `Take-Profit ($${pos.takeProfitPrice.toFixed(2)}) reached @ $${currentPrice.toFixed(2)} (+${leveragedPercent.toFixed(2)}% on margin)`
          : `Take-Profit (+${this.config.takeProfitPercent}%) reached @ $${currentPrice.toFixed(2)}`,
      };
    }

    // 3. Peak-tracking trailing stop
    if (this.config.trailingStopEnabled && pos.highestPrice > pos.entryPrice) {
      const dropFromPeak = ((pos.highestPrice - currentPrice) / pos.highestPrice) * 100 * pos.leverage;
      if (dropFromPeak >= this.config.trailingStopPercent && leveragedPercent > 0.5) {
        return {
          shouldExit: true,
          exitType: 'TRAILING_STOP',
          reason: `Trailing Stop (${this.config.trailingStopPercent}% on margin) triggered, peak $${pos.highestPrice.toFixed(2)}`,
        };
      }
    }

    // 4. Indicator exit (only once in profit, so it doesn't just realise noise as a loss)
    if (isSellSignal && leveragedPercent >= 0.6) {
      return { shouldExit: true, exitType: 'TECHNICAL_EXIT', reason: `Technical Trend Exit: ${sellReason}` };
    }

    return { shouldExit: false };
  }

  public getConfig(): RiskConfig {
    return this.config;
  }

  public getStatus() {
    this.rollDay();
    return {
      dailyRealizedLossUsd: this.dailyRealizedLossUsd,
      dailyLossLimitUsd: this.config.dailyLossLimitUsd,
      isCircuitBreakerTripped: this.isCircuitBreakerTripped,
      tripReason: this.tripReason,
      consecutiveLosses: this.consecutiveLosses,
      config: this.config,
    };
  }
}
