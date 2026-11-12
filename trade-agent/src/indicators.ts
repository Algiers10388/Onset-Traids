// ==============================================================================
// Autonomous Crypto Trading Agent: Quantitative Technical Indicator Engine
// Implements: MACD (12, 26, 9), RSI (14), Bollinger Bands (20, 2), & Confluence Scoring
// ==============================================================================

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  prevHistogram: number;
  isBullishCross: boolean;
  isBearishCross: boolean;
  isHistogramExpanding: boolean;
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
  isSqueeze: boolean;
  isPiercingUpper: boolean;
  isPiercingLower: boolean;
}

export interface ConfluenceReport {
  score: number; // 0 to 100
  verdict: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  factors: string[];
  macdStatus: string;
  rsiStatus: string;
  bollingerStatus: string;
}

export interface IndicatorSnapshot {
  price: number;
  rsi: number;
  macd: MACDResult;
  bollinger: BollingerResult;
  confluence: ConfluenceReport;
  atr: number;
  atrPercent: number;
}

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  let prevEMA = sum / period;
  emaArray.push(prevEMA);

  for (let i = period; i < prices.length; i++) {
    const currentEMA = prices[i] * k + prevEMA * (1 - k);
    emaArray.push(currentEMA);
    prevEMA = currentEMA;
  }
  return emaArray;
}

export function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length <= period) return closes.map(() => 50);

  const rsiSeries: number[] = new Array(closes.length).fill(50);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsiSeries[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiSeries[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  }

  return rsiSeries;
}

export function calculateMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): {
  series: Array<{ macd: number; signal: number; histogram: number }>;
  latest: MACDResult;
} {
  const len = closes.length;
  if (len < slow) {
    const emptySeries = closes.map(() => ({ macd: 0, signal: 0, histogram: 0 }));
    return {
      series: emptySeries,
      latest: {
        macd: 0,
        signal: 0,
        histogram: 0,
        prevHistogram: 0,
        isBullishCross: false,
        isBearishCross: false,
        isHistogramExpanding: false,
      },
    };
  }

  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const offset = slow - fast;

  const rawMacd: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    rawMacd.push(emaFast[i + offset] - emaSlow[i]);
  }

  const signalLine = calculateEMA(rawMacd, signalPeriod);
  const signalOffset = signalPeriod - 1;

  const series: Array<{ macd: number; signal: number; histogram: number }> = [];
  const leadingPadding = len - signalLine.length;
  for (let i = 0; i < leadingPadding; i++) {
    series.push({ macd: 0, signal: 0, histogram: 0 });
  }

  for (let i = 0; i < signalLine.length; i++) {
    const macdVal = rawMacd[i + signalOffset];
    const sigVal = signalLine[i];
    series.push({
      macd: macdVal,
      signal: sigVal,
      histogram: macdVal - sigVal,
    });
  }

  const last = series[series.length - 1] || { macd: 0, signal: 0, histogram: 0 };
  const prev = series[series.length - 2] || { macd: 0, signal: 0, histogram: 0 };

  return {
    series,
    latest: {
      macd: last.macd,
      signal: last.signal,
      histogram: last.histogram,
      prevHistogram: prev.histogram,
      isBullishCross: prev.macd <= prev.signal && last.macd > last.signal,
      isBearishCross: prev.macd >= prev.signal && last.macd < last.signal,
      isHistogramExpanding: Math.abs(last.histogram) > Math.abs(prev.histogram),
    },
  };
}

export function calculateBollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2
): {
  series: Array<{ upper: number; middle: number; lower: number; percentB: number; bandwidth: number }>;
  latest: BollingerResult;
} {
  const len = closes.length;
  const series: Array<{ upper: number; middle: number; lower: number; percentB: number; bandwidth: number }> = [];

  for (let i = 0; i < len; i++) {
    if (i < period - 1) {
      const price = closes[i];
      series.push({
        upper: price * 1.02,
        middle: price,
        lower: price * 0.98,
        percentB: 0.5,
        bandwidth: 0.04,
      });
      continue;
    }

    const windowSlice = closes.slice(i - period + 1, i + 1);
    const mean = windowSlice.reduce((sum, val) => sum + val, 0) / period;
    const variance = windowSlice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = mean + multiplier * stdDev;
    const middle = mean;
    const lower = mean - multiplier * stdDev;
    const bandDiff = upper - lower || 0.0001;
    const bandwidth = middle > 0 ? bandDiff / middle : 0;
    const currentPrice = closes[i];
    const percentB = (currentPrice - lower) / bandDiff;

    series.push({ upper, middle, lower, percentB, bandwidth });
  }

  const last = series[series.length - 1] || { upper: 0, middle: 0, lower: 0, percentB: 0.5, bandwidth: 0 };
  const lastPrice = closes[closes.length - 1] || 0;

  // Squeeze is RELATIVE: current bandwidth in the lowest ~20% of its own recent history.
  // (A fixed 3.5% threshold is meaningless on 1m bars, where bandwidth is normally 0.1-0.4%,
  //  so the old check was "always true".)
  const validBw = series.slice(period - 1).slice(-60).map((b) => b.bandwidth).sort((a, b) => a - b);
  let isSqueeze = false;
  if (validBw.length >= 20) {
    const p20 = validBw[Math.floor(validBw.length * 0.2)];
    isSqueeze = last.bandwidth <= p20;
  }

  return {
    series,
    latest: {
      upper: last.upper,
      middle: last.middle,
      lower: last.lower,
      bandwidth: last.bandwidth,
      percentB: last.percentB,
      isSqueeze,
      isPiercingUpper: lastPrice >= last.upper,
      isPiercingLower: lastPrice <= last.lower,
    },
  };
}

export function detectDivergence(
  candles: Candle[],
  rsiSeries: number[]
): {
  bullishDivergence: boolean;
  bearishDivergence: boolean;
} {
  if (candles.length < 25 || rsiSeries.length < 25) {
    return { bullishDivergence: false, bearishDivergence: false };
  }

  const n = candles.length;
  const currPrice = candles[n - 1].close;
  const prevPrice = candles[n - 15].close;

  const currRSI = rsiSeries[n - 1];
  const prevRSI = rsiSeries[n - 15];

  // Bullish Divergence: Price Lower Low, but RSI Higher Low (under 40)
  const bullishDivergence = currPrice < prevPrice && currRSI > prevRSI && currRSI < 42;

  // Bearish Divergence: Price Higher High, but RSI Lower High (above 60)
  const bearishDivergence = currPrice > prevPrice && currRSI < prevRSI && currRSI > 58;

  return { bullishDivergence, bearishDivergence };
}

export function computeConfluenceScore(
  candles: Candle[],
  macd: MACDResult,
  rsiVal: number,
  bollinger: BollingerResult,
  divergence: { bullishDivergence: boolean; bearishDivergence: boolean }
): ConfluenceReport {
  let score = 50;
  const factors: string[] = [];

  // 1. MACD Multi-Horizon Momentum Analysis (35% weight)
  let macdStatus = 'Neutral Momentum';
  if (macd.isBullishCross) {
    score += 18;
    macdStatus = 'Golden Cross (MACD Bullish Crossover)';
    factors.push('MACD Golden Cross (Fast Line crossed above Signal)');
  } else if (macd.isBearishCross) {
    score -= 18;
    macdStatus = 'Death Cross (MACD Bearish Crossover)';
    factors.push('MACD Death Cross (Fast Line crossed below Signal)');
  }

  if (macd.histogram > 0) {
    if (macd.isHistogramExpanding) {
      score += 10;
      factors.push('MACD Positive Momentum Accelerating (Green Expanding)');
    } else {
      score += 4;
      factors.push('MACD Positive Histogram (Consolidating)');
    }
  } else if (macd.histogram < 0) {
    if (macd.isHistogramExpanding) {
      score -= 10;
      factors.push('MACD Downside Pressure Accelerating (Red Expanding)');
    } else {
      score -= 4;
      factors.push('MACD Negative Histogram (Decelerating)');
    }
  }

  if (macd.macd > 0) {
    score += 4;
    factors.push('MACD above Zero Baseline (Structural Bullish Regime)');
  } else {
    score -= 4;
    factors.push('MACD below Zero Baseline (Structural Bearish Regime)');
  }

  // 2. Relative Strength Index (35% weight)
  let rsiStatus = 'Balanced (45-55)';
  if (rsiVal <= 30) {
    score += 20;
    rsiStatus = `Oversold Reversal Zone (${rsiVal.toFixed(1)})`;
    factors.push(`RSI Deeply Oversold (${rsiVal.toFixed(1)} <= 30) - High Probability Mean Reversion`);
  } else if (rsiVal < 42) {
    score += 10;
    rsiStatus = `Bullish Discount (${rsiVal.toFixed(1)})`;
    factors.push(`RSI In Bullish Discount (${rsiVal.toFixed(1)})`);
  } else if (rsiVal >= 70) {
    score -= 20;
    rsiStatus = `Overbought Exhaustion (${rsiVal.toFixed(1)})`;
    factors.push(`RSI Overbought (${rsiVal.toFixed(1)} >= 70) - High Pullback Probability`);
  } else if (rsiVal > 58) {
    score -= 10;
    rsiStatus = `Bearish Premium (${rsiVal.toFixed(1)})`;
    factors.push(`RSI In Bearish Premium (${rsiVal.toFixed(1)})`);
  }

  if (divergence.bullishDivergence) {
    score += 14;
    factors.push('Regular Bullish Divergence Confirmed (Price Lower Low with RSI Higher Low)');
  } else if (divergence.bearishDivergence) {
    score -= 14;
    factors.push('Regular Bearish Divergence Confirmed (Price Higher High with RSI Lower High)');
  }

  // 3. Bollinger Bands Volatility & %B Positioning (30% weight)
  let bollingerStatus = 'Normal Bandwidth';
  if (bollinger.isSqueeze) {
    bollingerStatus = 'Volatility Squeeze Active (bandwidth in lowest 20% of recent range)';
    factors.push(`Bollinger Squeeze Alert (BW: ${(bollinger.bandwidth * 100).toFixed(2)}%) - Explosive Breakout Imminent`);
    if (macd.histogram > 0 && macd.isHistogramExpanding) {
      score += 12;
      factors.push('Bollinger Squeeze + Bullish Momentum Expansion (High Confidence Upward Breakout)');
    } else if (macd.histogram < 0 && macd.isHistogramExpanding) {
      score -= 12;
      factors.push('Bollinger Squeeze + Bearish Momentum Expansion (Downside Breakout Warning)');
    }
  }

  if (bollinger.percentB <= 0.15) {
    score += 12;
    bollingerStatus = 'Piercing Lower Band (%B <= 0.15)';
    factors.push(`Price Piercing Lower Bollinger Band (%B: ${bollinger.percentB.toFixed(2)}) - Oversold Bounce Setup`);
  } else if (bollinger.percentB >= 0.85) {
    score -= 12;
    bollingerStatus = 'Piercing Upper Band (%B >= 0.85)';
    factors.push(`Price Piercing Upper Bollinger Band (%B: ${bollinger.percentB.toFixed(2)}) - Mean-Reversion Risk`);
  }

  const boundedScore = Math.max(5, Math.min(95, Math.round(score)));
  let verdict: ConfluenceReport['verdict'] = 'NEUTRAL';
  if (boundedScore >= 75) verdict = 'STRONG_BUY';
  else if (boundedScore >= 60) verdict = 'BUY';
  else if (boundedScore <= 25) verdict = 'STRONG_SELL';
  else if (boundedScore <= 40) verdict = 'SELL';

  return {
    score: boundedScore,
    verdict,
    factors,
    macdStatus,
    rsiStatus,
    bollingerStatus,
  };
}

export function calculateATR(
  candles: Candle[],
  period = 14
): {
  atr: number;
  atrPercent: number;
  series: number[];
} {
  if (candles.length < 2) {
    const p = candles[0]?.close || 1;
    return { atr: p * 0.02, atrPercent: 2.0, series: [] };
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - prev.close);
    const tr3 = Math.abs(current.low - prev.close);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  if (trueRanges.length < period) {
    const avg = trueRanges.reduce((a, b) => a + b, 0) / (trueRanges.length || 1);
    const lastPrice = candles[candles.length - 1].close || 1;
    return { atr: avg, atrPercent: (avg / lastPrice) * 100, series: trueRanges };
  }

  // Wilder's Exponential Smoothing for ATR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const series: number[] = [atr];

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    series.push(atr);
  }

  const latestPrice = candles[candles.length - 1].close || 1;
  const atrPercent = (atr / latestPrice) * 100;

  return {
    atr,
    atrPercent,
    series,
  };
}

export function evaluateSnapshot(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1] || 0;

  const rsiSeries = calculateRSI(closes, 14);
  const currentRSI = rsiSeries[rsiSeries.length - 1] ?? 50; // '|| 50' turned a real RSI of 0 into 50

  const macdData = calculateMACD(closes, 12, 26, 9);
  const bbData = calculateBollingerBands(closes, 20, 2);
  const div = detectDivergence(candles, rsiSeries);
  const atrData = calculateATR(candles, 14);

  const confluence = computeConfluenceScore(candles, macdData.latest, currentRSI, bbData.latest, div);

  return {
    price: currentPrice,
    rsi: currentRSI,
    macd: macdData.latest,
    bollinger: bbData.latest,
    confluence,
    atr: atrData.atr,
    atrPercent: atrData.atrPercent,
  };
}
