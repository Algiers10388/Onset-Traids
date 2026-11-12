import { Candle, TechnicalIndicators } from '../types';

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let prevEMA = sum / period;
  emaArray.push(prevEMA);

  for (let i = period; i < prices.length; i++) {
    const currentEMA = prices[i] * k + prevEMA * (1 - k);
    emaArray.push(currentEMA);
    prevEMA = currentEMA;
  }
  return emaArray;
}

export function calculateRSISeries(closes: number[], period = 14): number[] {
  if (closes.length === 0) return [];
  if (closes.length <= period) {
    return closes.map(() => 50);
  }

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
  rsiSeries[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

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
    rsiSeries[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }

  return rsiSeries;
}

export function calculateMACDSeries(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): {
  series: Array<{ macd: number; signal: number; histogram: number }>;
  latest: {
    macd: number;
    signal: number;
    histogram: number;
    prevHistogram: number;
    isBullishCross: boolean;
    isBearishCross: boolean;
    isHistogramExpanding: boolean;
  };
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
  // Pad the beginning so series length matches closes.length
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

  const isBullishCross = prev.macd <= prev.signal && last.macd > last.signal;
  const isBearishCross = prev.macd >= prev.signal && last.macd < last.signal;
  const isHistogramExpanding = Math.abs(last.histogram) > Math.abs(prev.histogram);

  return {
    series,
    latest: {
      macd: last.macd,
      signal: last.signal,
      histogram: last.histogram,
      prevHistogram: prev.histogram,
      isBullishCross,
      isBearishCross,
      isHistogramExpanding,
    },
  };
}

export function calculateBollingerSeries(
  closes: number[],
  period = 20,
  multiplier = 2
): {
  series: Array<{ upper: number; middle: number; lower: number; percentB: number; bandwidth: number }>;
  latest: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    percentB: number;
    isSqueeze: boolean;
    isPiercingUpper: boolean;
    isPiercingLower: boolean;
  };
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

    series.push({
      upper,
      middle,
      lower,
      percentB,
      bandwidth,
    });
  }

  const last = series[series.length - 1] || { upper: 0, middle: 0, lower: 0, percentB: 0.5, bandwidth: 0 };
  const lastPrice = closes[closes.length - 1] || 0;

  // Squeeze detection: bandwidth is low relative to recent average
  const recentBandwidths = series.slice(-20).map((b) => b.bandwidth);
  const avgBandwidth = recentBandwidths.reduce((a, b) => a + b, 0) / (recentBandwidths.length || 1);
  const isSqueeze = last.bandwidth < avgBandwidth * 0.75;

  const isPiercingUpper = lastPrice >= last.upper || last.percentB >= 1.0;
  const isPiercingLower = lastPrice <= last.lower || last.percentB <= 0.0;

  return {
    series,
    latest: {
      ...last,
      isSqueeze,
      isPiercingUpper,
      isPiercingLower,
    },
  };
}

export function detectDivergence(
  closes: number[],
  rsiSeries: number[],
  lookback = 20
): { isBullish: boolean; isBearish: boolean; status: string } {
  if (!closes || closes.length < lookback || !rsiSeries || rsiSeries.length < lookback) {
    return { isBullish: false, isBearish: false, status: 'Insufficient history for divergence' };
  }

  const recentCloses = closes.slice(-lookback);
  const recentRsi = rsiSeries.slice(-lookback);
  const n = recentCloses.length;
  const currentPrice = recentCloses[n - 1];
  const currentRsi = recentRsi[n - 1];

  // Find local price minimums & maximums in the first half vs second half
  const mid = Math.floor(n / 2);
  let min1Idx = 0;
  let min2Idx = mid;
  let max1Idx = 0;
  let max2Idx = mid;

  for (let i = 1; i < mid; i++) {
    if (recentCloses[i] < recentCloses[min1Idx]) min1Idx = i;
    if (recentCloses[i] > recentCloses[max1Idx]) max1Idx = i;
  }
  for (let i = mid + 1; i < n; i++) {
    if (recentCloses[i] < recentCloses[min2Idx]) min2Idx = i;
    if (recentCloses[i] > recentCloses[max2Idx]) max2Idx = i;
  }

  const pMin1 = recentCloses[min1Idx];
  const rMin1 = recentRsi[min1Idx];
  const pMin2 = recentCloses[min2Idx];
  const rMin2 = recentRsi[min2Idx];

  const pMax1 = recentCloses[max1Idx];
  const rMax1 = recentRsi[max1Idx];
  const pMax2 = recentCloses[max2Idx];
  const rMax2 = recentRsi[max2Idx];

  // Bullish Regular Divergence: Price makes lower low, but RSI forms higher low in oversold/recovery zone
  const isBullish =
    pMin2 < pMin1 * 0.998 &&
    rMin2 > rMin1 + 1.5 &&
    currentRsi <= 48 &&
    rMin1 <= 40;

  // Bearish Regular Divergence: Price makes higher high, but RSI forms lower high in overbought/distribution zone
  const isBearish =
    pMax2 > pMax1 * 1.002 &&
    rMax2 < rMax1 - 1.5 &&
    currentRsi >= 56 &&
    rMax1 >= 62;

  let status = 'No Active Divergence';
  if (isBullish) {
    status = 'Bullish Regular Divergence (Price Lower Low vs RSI Higher Low)';
  } else if (isBearish) {
    status = 'Bearish Regular Divergence (Price Higher High vs RSI Lower High)';
  }

  return { isBullish, isBearish, status };
}

export function evaluateTrendConfluence(
  lastPrice: number,
  rsi: number,
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    prevHistogram?: number;
    isBullishCross?: boolean;
    isBearishCross?: boolean;
    isHistogramExpanding?: boolean;
  },
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    percentB?: number;
    bandwidth?: number;
    isSqueeze?: boolean;
    isPiercingUpper?: boolean;
    isPiercingLower?: boolean;
  },
  historyContext?: {
    closes?: number[];
    rsiSeries?: number[];
    macdSeries?: Array<{ macd: number; signal: number; histogram: number }>;
  }
) {
  let score = 0;
  const pctB = bollinger.percentB ?? 0.5;
  const confluenceFactors: string[] = [];

  // --- 1. MACD Multi-Horizon Momentum Analysis (35% weight) ---
  let macdStatus = 'Neutral Momentum';
  if (macd.isBullishCross) {
    score += 35;
    macdStatus = 'Golden Cross (MACD Bullish Crossover)';
    confluenceFactors.push('MACD Golden Cross (Bullish Crossover above Signal)');
  } else if (macd.isBearishCross) {
    score -= 35;
    macdStatus = 'Death Cross (MACD Bearish Crossover)';
    confluenceFactors.push('MACD Death Cross (Bearish Crossover below Signal)');
  } else if (macd.histogram > 0) {
    const isExpanding = macd.prevHistogram !== undefined ? macd.histogram > macd.prevHistogram : true;
    if (isExpanding) {
      score += 26;
      macdStatus = 'Bullish Acceleration (Expanding Green Histogram)';
      confluenceFactors.push('MACD Positive Momentum Acceleration');
    } else {
      score += 12;
      macdStatus = 'Bullish Fading (Decelerating Histogram)';
    }
  } else if (macd.histogram < 0) {
    const isExpanding = macd.prevHistogram !== undefined ? macd.histogram < macd.prevHistogram : true;
    if (isExpanding) {
      score -= 26;
      macdStatus = 'Bearish Acceleration (Expanding Red Histogram)';
      confluenceFactors.push('MACD Downside Pressure Accelerating');
    } else {
      score -= 12;
      macdStatus = 'Bearish Fading (Decelerating Red Histogram)';
    }
  }

  // Bonus for MACD Baseline Confirmation
  if (macd.macd > 0 && macd.histogram > 0) {
    score += 6;
    confluenceFactors.push('MACD above Zero Baseline (Bullish Regime)');
  } else if (macd.macd < 0 && macd.histogram < 0) {
    score -= 6;
    confluenceFactors.push('MACD below Zero Baseline (Bearish Regime)');
  }

  // --- 2. RSI Multi-Zone & Divergence Analysis (35% weight) ---
  let rsiStatus = 'RSI Neutral (45-55)';
  if (rsi <= 28) {
    score += 35;
    rsiStatus = `Deep Oversold Rebound (RSI ${rsi.toFixed(1)} <= 28)`;
    confluenceFactors.push(`RSI Deep Oversold (${rsi.toFixed(1)})`);
  } else if (rsi <= 38) {
    score += 24;
    rsiStatus = `Bullish Value Zone (RSI ${rsi.toFixed(1)})`;
    confluenceFactors.push(`RSI Bullish Accumulation Zone (${rsi.toFixed(1)})`);
  } else if (rsi <= 45) {
    score += 12;
    rsiStatus = `Mild Bullish Rebound (RSI ${rsi.toFixed(1)})`;
  } else if (rsi >= 76) {
    score -= 35;
    rsiStatus = `Extreme Overbought Exhaustion (RSI ${rsi.toFixed(1)} >= 76)`;
    confluenceFactors.push(`RSI Extreme Overbought (${rsi.toFixed(1)})`);
  } else if (rsi >= 68) {
    score -= 24;
    rsiStatus = `Overbought Pullback Warning (RSI ${rsi.toFixed(1)})`;
    confluenceFactors.push(`RSI Overbought Resistance (${rsi.toFixed(1)})`);
  } else if (rsi >= 58) {
    score -= 10;
    rsiStatus = `Mild Bearish Overhead (RSI ${rsi.toFixed(1)})`;
  } else if (rsi > 50) {
    score += 5;
    rsiStatus = `Bullish Midline Support (RSI ${rsi.toFixed(1)})`;
  } else {
    score -= 5;
    rsiStatus = `Bearish Midline Pressure (RSI ${rsi.toFixed(1)})`;
  }

  // RSI Divergence Integration
  let divergenceStatus = 'None';
  if (historyContext?.closes && historyContext?.rsiSeries) {
    const div = detectDivergence(historyContext.closes, historyContext.rsiSeries);
    divergenceStatus = div.status;
    if (div.isBullish) {
      score += 28;
      confluenceFactors.push('Bullish RSI Divergence: Smart Money Accumulation');
    } else if (div.isBearish) {
      score -= 28;
      confluenceFactors.push('Bearish RSI Divergence: Smart Money Distribution');
    }
  }

  // --- 3. Bollinger Bands Volatility & Mean Reversion (30% weight) ---
  let bollingerStatus = 'Within Normal Volatility Channel';
  if (pctB <= 0.05 || bollinger.isPiercingLower) {
    score += 30;
    bollingerStatus = `Lower Band Bounce (%B ${pctB.toFixed(2)} - Mean Reversion Support)`;
    confluenceFactors.push('Bollinger Lower Band Piercing / Strong Support Bounce');
  } else if (pctB <= 0.22) {
    score += 18;
    bollingerStatus = `Lower Band Accumulation (%B ${pctB.toFixed(2)})`;
    confluenceFactors.push('Bollinger Lower Band Accumulation');
  } else if (pctB >= 0.95 || bollinger.isPiercingUpper) {
    score -= 30;
    bollingerStatus = `Upper Band Resistance / Piercing (%B ${pctB.toFixed(2)} - Overextended)`;
    confluenceFactors.push('Bollinger Upper Band Piercing / Overextended Resistance');
  } else if (pctB >= 0.78) {
    score -= 18;
    bollingerStatus = `Upper Band Distribution (%B ${pctB.toFixed(2)})`;
    confluenceFactors.push('Bollinger Upper Band Distribution');
  } else if (bollinger.isSqueeze) {
    const squeezeMsg = `Volatility Squeeze (Bandwidth ${((bollinger.bandwidth || 0) * 100).toFixed(1)}%)`;
    if (macd.histogram > 0) {
      score += 15;
      bollingerStatus = `${squeezeMsg} • Bullish Outbreak Initiating`;
      confluenceFactors.push('Bollinger Squeeze with Bullish Momentum Expansion');
    } else if (macd.histogram < 0) {
      score -= 15;
      bollingerStatus = `${squeezeMsg} • Bearish Breakdown Initiating`;
      confluenceFactors.push('Bollinger Squeeze with Bearish Downward Expansion');
    } else {
      bollingerStatus = `${squeezeMsg} • Consolidation / Breakout Imminent`;
    }
  }

  // Normalize scores to [-100, 100]
  const clampedScore = Math.max(-100, Math.min(100, Math.round(score)));
  const buyConfidence = Math.max(0, Math.min(100, Math.round((clampedScore + 100) / 2)));
  const sellConfidence = Math.max(0, Math.min(100, Math.round((100 - clampedScore) / 2)));

  // Bias Categorization
  let overallBias: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' = 'NEUTRAL';
  let recommendedAction: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' = 'HOLD';

  if (clampedScore >= 50) {
    overallBias = 'STRONG_BULLISH';
    recommendedAction = 'STRONG_BUY';
  } else if (clampedScore >= 25) {
    overallBias = 'BULLISH';
    recommendedAction = 'BUY';
  } else if (clampedScore <= -50) {
    overallBias = 'STRONG_BEARISH';
    recommendedAction = 'STRONG_SELL';
  } else if (clampedScore <= -25) {
    overallBias = 'BEARISH';
    recommendedAction = 'SELL';
  }

  // Precision Signal Trigger Conditions
  // High-precision BUY signal occurs when multiple indicators align
  const isPrecisionBuy =
    (clampedScore >= 38 && buyConfidence >= 65) ||
    Boolean(macd.isBullishCross && rsi <= 45 && pctB <= 0.40) ||
    Boolean(rsi <= 32 && (macd.histogram > 0 || pctB <= 0.15)) ||
    (divergenceStatus.includes('Bullish') && rsi <= 48);

  // High-precision SELL signal occurs when multiple indicators align
  const isPrecisionSell =
    (clampedScore <= -38 && sellConfidence >= 65) ||
    Boolean(macd.isBearishCross && rsi >= 65 && pctB >= 0.70) ||
    Boolean(rsi >= 72 && (macd.histogram < 0 || pctB >= 0.88)) ||
    (divergenceStatus.includes('Bearish') && rsi >= 58);

  let precisionBuyReason = '';
  if (isPrecisionBuy) {
    precisionBuyReason = `Precision BUY Confluence: ${macdStatus} + ${rsiStatus} + ${bollingerStatus}`;
  }

  let precisionSellReason = '';
  if (isPrecisionSell) {
    precisionSellReason = `Precision SELL Confluence: ${macdStatus} + ${rsiStatus} + ${bollingerStatus}`;
  }

  let summary = '';
  if (isPrecisionBuy) {
    summary = `Bullish Confluence (+${clampedScore}% Score, ${buyConfidence}% Conf): ${macdStatus} aligned with ${rsiStatus} & ${bollingerStatus}`;
  } else if (isPrecisionSell) {
    summary = `Bearish Confluence (${clampedScore}% Score, ${sellConfidence}% Conf): ${macdStatus} aligned with ${rsiStatus} & ${bollingerStatus}`;
  } else {
    summary = `Neutral Consolidation (${clampedScore}% Bias): ${macdStatus} | ${rsiStatus} | ${bollingerStatus}`;
  }

  // Dynamic Exit Target Projections derived from Bollinger Bands & Volatility
  const bandRange = bollinger.upper - bollinger.lower || lastPrice * 0.04;
  const suggestedTakeProfit = lastPrice > 0 ? bollinger.upper : 0;
  const suggestedStopLoss = lastPrice > 0 ? Math.max(0, bollinger.lower - bandRange * 0.15) : 0;

  return {
    overallBias,
    confluenceScore: clampedScore,
    buyConfidence,
    sellConfidence,
    summary,
    signals: {
      macdStatus,
      rsiStatus,
      bollingerStatus,
      isPrecisionBuy,
      isPrecisionSell,
      precisionBuyReason,
      precisionSellReason,
      recommendedAction,
      confluenceFactors,
      divergenceStatus,
    },
    suggestedTakeProfit,
    suggestedStopLoss,
  };
}

export interface IndicatorConfig {
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  rsiPeriod?: number;
  bollingerPeriod?: number;
  bollingerStdDev?: number;
}

export function computeIndicators(
  candles: Candle[],
  config?: IndicatorConfig
): TechnicalIndicators {
  const closes = candles.map((c) => c.close);
  const rsiPeriod = config?.rsiPeriod ?? 14;
  const macdFast = config?.macdFast ?? 12;
  const macdSlow = config?.macdSlow ?? 26;
  const macdSignal = config?.macdSignal ?? 9;
  const bollingerPeriod = config?.bollingerPeriod ?? 20;
  const bollingerStdDev = config?.bollingerStdDev ?? 2;

  const rsiSeries = calculateRSISeries(closes, rsiPeriod);
  const macdData = calculateMACDSeries(closes, macdFast, macdSlow, macdSignal);
  const bollingerData = calculateBollingerSeries(closes, bollingerPeriod, bollingerStdDev);

  const ema9Series = calculateEMA(closes, 9);
  const ema21Series = calculateEMA(closes, 21);

  const latestPrice = closes[closes.length - 1] || 0;
  const latestRsi = rsiSeries[rsiSeries.length - 1] ?? 50;
  const latestEma9 = ema9Series[ema9Series.length - 1] ?? latestPrice;
  const latestEma21 = ema21Series[ema21Series.length - 1] ?? latestPrice;

  // Average True Range (14) & Volatility Analysis
  const atrData = calculateATR(candles, 14);
  const historicalVolatility = calculateHistoricalVolatility(closes, 20);

  // Dynamic Position Sizing Preview for $10,000 reference capital
  const dynamicSizingPreview = calculateDynamicPositionSize({
    portfolioCash: 10000,
    currentPrice: latestPrice,
    atr: atrData.atr,
    atrMultiplier: 2.0,
    riskPerTradePercent: 2.0,
    leverage: 2,
    maxCapPercent: 35,
  });

  const trendAnalysis = evaluateTrendConfluence(
    latestPrice,
    latestRsi,
    macdData.latest,
    bollingerData.latest,
    {
      closes,
      rsiSeries,
      macdSeries: macdData.series,
    }
  );

  return {
    rsi: latestRsi,
    macd: macdData.latest,
    ema9: latestEma9,
    ema21: latestEma21,
    bollinger: bollingerData.latest,
    trendAnalysis,
    atr: atrData.atr,
    atrPercent: atrData.atrPercent,
    historicalVolatility,
    dynamicSizingPreview: {
      volatilityAdjustedMargin: dynamicSizingPreview.margin,
      volatilityAdjustedNotional: dynamicSizingPreview.notional,
      recommendedUnits: dynamicSizingPreview.units,
      riskAmountUsd: dynamicSizingPreview.riskAmountUsd,
      volatilityRegime: dynamicSizingPreview.volatilityRegime,
      sizingMultiplier: dynamicSizingPreview.sizingMultiplier,
    },
    history: {
      rsiSeries,
      macdSeries: macdData.series,
      bollingerSeries: bollingerData.series,
      ema9Series,
      ema21Series,
    },
  };
}

export function formatCurrency(value: number, decimals?: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 2,
    }).format(value);
  }
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 4,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals ?? 4,
    maximumFractionDigits: decimals ?? 6,
  }).format(value);
}

export function formatPercent(value: number, includeSign = true): string {
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// ==============================================================================
// ADVANCED RISK MANAGEMENT: ATR, VOLATILITY & DYNAMIC POSITION SIZING
// ==============================================================================

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

export function calculateHistoricalVolatility(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 2.5;
  const logReturns: number[] = [];
  const start = closes.length - period - 1;
  for (let i = start + 1; i < closes.length; i++) {
    const r = Math.log(closes[i] / (closes[i - 1] || 1));
    logReturns.push(r);
  }
  const mean = logReturns.reduce((sum, val) => sum + val, 0) / logReturns.length;
  const variance = logReturns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / logReturns.length;
  const stdDev = Math.sqrt(variance);
  // Returns annualized volatility percentage estimate
  return Math.round(stdDev * Math.sqrt(365 * 24 * 60) * 100 * 10) / 10;
}

export interface DynamicPositionSizeParams {
  portfolioCash: number;
  currentPrice: number;
  atr: number;
  atrMultiplier?: number; // default 2.0
  riskPerTradePercent?: number; // default 2.0%
  leverage?: number; // default 1
  maxCapPercent?: number; // default 35% of portfolio
  minOrderUsd?: number; // default 30
}

export interface DynamicPositionSizeResult {
  margin: number;
  notional: number;
  units: number;
  riskAmountUsd: number;
  stopDistanceUsd: number;
  stopDistancePercent: number;
  volatilityRegime: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
  sizingMultiplier: number; // vs static 20%
}

export function calculateDynamicPositionSize(
  params: DynamicPositionSizeParams
): DynamicPositionSizeResult {
  const {
    portfolioCash,
    currentPrice,
    atr,
    atrMultiplier = 2.0,
    riskPerTradePercent = 2.0,
    leverage = 1,
    maxCapPercent = 35.0,
    minOrderUsd = 30.0,
  } = params;

  // 1. Defined Dollar Risk: Amount of cash the trader is willing to lose if stop-loss triggers
  const riskAmountUsd = Math.max(5, portfolioCash * (riskPerTradePercent / 100));

  // 2. Volatility Stop Buffer: Stop loss distance based on ATR
  const safePrice = Math.max(0.0001, currentPrice);
  const safeAtr = atr > 0 ? atr : safePrice * 0.018;
  const stopDistanceUsd = safeAtr * atrMultiplier;
  const stopDistancePercent = (stopDistanceUsd / safePrice) * 100;

  // 3. Volatility-Adjusted Sizing formula:
  // Notional = RiskAmount / (StopDistance / CurrentPrice)
  // When ATR increases -> StopDistance increases -> Notional scales DOWN
  // When ATR decreases -> StopDistance decreases -> Notional scales UP
  const stopLossFraction = Math.max(0.005, stopDistanceUsd / safePrice);
  const rawNotional = riskAmountUsd / stopLossFraction;
  const rawMargin = rawNotional / Math.max(1, leverage);

  // 4. Volatility Regime Classification
  const atrPct = (safeAtr / safePrice) * 100;
  let volatilityRegime: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME' = 'NORMAL';
  if (atrPct < 0.9) volatilityRegime = 'LOW';
  else if (atrPct <= 2.2) volatilityRegime = 'NORMAL';
  else if (atrPct <= 4.0) volatilityRegime = 'ELEVATED';
  else volatilityRegime = 'EXTREME';

  // 5. Benchmark vs Fixed 20%
  const benchmarkMargin = portfolioCash * 0.20;

  // 6. Hard Capital Guardrails: Never exceed maxCapPercent of portfolio, never below minOrderUsd
  const maxAllowedMargin = Math.max(minOrderUsd, portfolioCash * (maxCapPercent / 100));
  const boundedMargin = Math.max(
    minOrderUsd,
    Math.min(maxAllowedMargin, Math.round(rawMargin * 100) / 100)
  );

  const finalNotional = boundedMargin * leverage;
  const units = finalNotional / safePrice;
  const sizingMultiplier = benchmarkMargin > 0 ? Math.round((boundedMargin / benchmarkMargin) * 100) / 100 : 1;

  return {
    margin: boundedMargin,
    notional: finalNotional,
    units,
    riskAmountUsd,
    stopDistanceUsd,
    stopDistancePercent,
    volatilityRegime,
    sizingMultiplier,
  };
}

export function calculateRiskRewardTargets(
  entryPrice: number,
  stopLossPercent: number,
  riskRewardRatio: number,
  leverage: number
): {
  stopLossPrice: number;
  takeProfitPrice: number;
  takeProfitPercent: number;
  stopDistanceUsd: number;
  targetGainUsd: number;
} {
  const effectiveStopPct = stopLossPercent / Math.max(1, leverage);
  const effectiveTpPct = (stopLossPercent * riskRewardRatio) / Math.max(1, leverage);

  const stopLossPrice = entryPrice * (1 - effectiveStopPct / 100);
  const takeProfitPrice = entryPrice * (1 + effectiveTpPct / 100);

  return {
    stopLossPrice,
    takeProfitPrice,
    takeProfitPercent: stopLossPercent * riskRewardRatio,
    stopDistanceUsd: entryPrice - stopLossPrice,
    targetGainUsd: takeProfitPrice - entryPrice,
  };
}
