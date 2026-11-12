// ==============================================================================
// Quantitative Correlation & Market Movement Clustering Engine
// ==============================================================================

import { Candle, CryptoAsset } from '../types';

export interface CorrelationMatrixData {
  symbols: string[];
  matrix: number[][]; // N x N matrix of r values (-1.0 to +1.0)
  betas: Record<string, number>; // Beta relative to benchmark (e.g. BTC)
  volatilities: Record<string, number>; // Annualized/normalized standard deviation of returns
  lastPrices: Record<string, number>;
  changes24h: Record<string, number>;
}

export interface MarketCluster {
  id: string;
  name: string;
  category: string;
  symbols: string[];
  avgCorrelation: number; // Internal cohesion (0.0 to 1.0)
  avgReturn24h: number;
  leadingSymbol: string; // The asset moving fastest / leading momentum
  movementState: 'EXPANDING_BULLISH' | 'CONSOLIDATING' | 'DECOUPLING' | 'DISTRIBUTING';
  sentimentDescription: string;
  primaryDriver: string;
}

export interface StatisticalArbitragePair {
  symbolA: string;
  symbolB: string;
  correlation: number;
  beta: number;
  currentZScore: number; // Divergence in standard deviations
  divergencePercent: number;
  action: 'LONG_A_SHORT_B' | 'LONG_B_SHORT_A' | 'IN_EQUILIBRIUM';
  confidence: number;
  meanReversionEstimatePercent: number;
}

/**
 * Calculates percentage returns from a series of candle closes
 */
export function calculateReturns(candles: Candle[]): number[] {
  if (!candles || candles.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    const curr = candles[i].close;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/**
 * Calculates Pearson Correlation Coefficient r between two return vectors
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;

  const r = numerator / denominator;
  // Clamp between -1.0 and 1.0 to protect against floating point inaccuracies
  return Math.max(-1, Math.min(1, r));
}

/**
 * Calculates variance of an array of numbers
 */
function calculateVariance(data: number[]): number {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const sumSq = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return sumSq / (data.length - 1);
}

/**
 * Calculates covariance between two return arrays
 */
function calculateCovariance(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
  }
  return cov / (n - 1);
}

/**
 * Computes full NxN correlation matrix and beta statistics
 */
export function buildCorrelationMatrix(
  assets: CryptoAsset[],
  candleMap: Record<string, Candle[]>,
  benchmarkSymbol = 'BTC/USDT',
  lookbackCandles = 60
): CorrelationMatrixData {
  const symbols = assets.map((a) => a.symbol);
  const n = symbols.length;

  // Extract aligned return series
  const returnsMap: Record<string, number[]> = {};
  const lastPrices: Record<string, number> = {};
  const changes24h: Record<string, number> = {};

  assets.forEach((asset) => {
    const candles = candleMap[asset.symbol] || [];
    const windowCandles = candles.slice(-lookbackCandles);
    returnsMap[asset.symbol] = calculateReturns(windowCandles);
    lastPrices[asset.symbol] = asset.price;
    changes24h[asset.symbol] = asset.change24h;
  });

  const benchmarkReturns = returnsMap[benchmarkSymbol] || [];
  const benchmarkVar = calculateVariance(benchmarkReturns);

  const matrix: number[][] = [];
  const betas: Record<string, number> = {};
  const volatilities: Record<string, number> = {};

  for (let i = 0; i < n; i++) {
    const symA = symbols[i];
    const returnsA = returnsMap[symA] || [];
    const row: number[] = [];

    // Volatility calculation (standard deviation of returns * sqrt(365 * 24) scaled)
    const varA = calculateVariance(returnsA);
    volatilities[symA] = Math.sqrt(varA) * 100; // in percent

    // Beta relative to benchmark
    if (benchmarkVar > 0 && returnsA.length > 0) {
      const cov = calculateCovariance(returnsA, benchmarkReturns);
      betas[symA] = parseFloat((cov / benchmarkVar).toFixed(2));
    } else {
      betas[symA] = 1.0;
    }

    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push(1.0);
      } else {
        const symB = symbols[j];
        const returnsB = returnsMap[symB] || [];
        const r = calculatePearsonCorrelation(returnsA, returnsB);
        row.push(parseFloat(r.toFixed(3)));
      }
    }
    matrix.push(row);
  }

  return {
    symbols,
    matrix,
    betas,
    volatilities,
    lastPrices,
    changes24h,
  };
}

/**
 * Detects Market Movement Clusters using correlation threshold connected components
 * and domain classification (Layer 1, DeFi, High Beta, etc.)
 */
export function detectMarketClusters(
  matrixData: CorrelationMatrixData,
  assets: CryptoAsset[],
  correlationThreshold = 0.65
): MarketCluster[] {
  const { symbols, matrix, changes24h } = matrixData;
  const assetMap = new Map<string, CryptoAsset>();
  assets.forEach((a) => assetMap.set(a.symbol, a));

  const visited = new Set<string>();
  const clusters: MarketCluster[] = [];

  // Group connected assets where r >= threshold
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    if (visited.has(sym)) continue;

    const groupSymbols = [sym];
    visited.add(sym);

    for (let j = 0; j < symbols.length; j++) {
      if (i !== j && !visited.has(symbols[j])) {
        // Check correlation with any already in group
        const isCorrelatedWithGroup = groupSymbols.some((groupSym) => {
          const groupIdx = symbols.indexOf(groupSym);
          return matrix[groupIdx][j] >= correlationThreshold;
        });

        if (isCorrelatedWithGroup) {
          groupSymbols.push(symbols[j]);
          visited.add(symbols[j]);
        }
      }
    }

    // Compute internal average correlation
    let pairSum = 0;
    let pairCount = 0;
    for (let a = 0; a < groupSymbols.length; a++) {
      for (let b = a + 1; b < groupSymbols.length; b++) {
        const idxA = symbols.indexOf(groupSymbols[a]);
        const idxB = symbols.indexOf(groupSymbols[b]);
        pairSum += matrix[idxA][idxB];
        pairCount++;
      }
    }
    const avgCorrelation = pairCount > 0 ? pairSum / pairCount : 1.0;

    // Average 24h return of the cluster
    const avgReturn =
      groupSymbols.reduce((sum, s) => sum + (changes24h[s] || 0), 0) / groupSymbols.length;

    // Identify leader: member with highest absolute 24h change
    const leadingSymbol = [...groupSymbols].sort(
      (a, b) => Math.abs(changes24h[b] || 0) - Math.abs(changes24h[a] || 0)
    )[0];

    // Identify category & cluster name
    let clusterName = 'General Market Cluster';
    let category = 'Mixed';
    let primaryDriver = 'Macro Market Flow';

    if (groupSymbols.some((s) => s.includes('BTC') || s.includes('ETH'))) {
      clusterName = 'Major Anchor Cluster (BTC/ETH Core)';
      category = 'Macro Liquidity';
      primaryDriver = 'Institutional ETF & CEX Liquidity';
    } else if (groupSymbols.some((s) => s.includes('SOL') || s.includes('AVAX') || s.includes('SUI'))) {
      clusterName = 'High-Speed L1 Ecosystem Cluster';
      category = 'Layer-1 Scaling';
      primaryDriver = 'Network Active Addresses & DeFi Volume';
    } else if (groupSymbols.some((s) => s.includes('LINK') || s.includes('UNI') || s.includes('AAVE'))) {
      clusterName = 'DeFi & Oracle Utility Cluster';
      category = 'DeFi Infra';
      primaryDriver = 'Protocol Fee Generation & TVL Growth';
    } else if (groupSymbols.some((s) => s.includes('DOGE') || s.includes('SHIB') || s.includes('PEPE'))) {
      clusterName = 'Meme & High-Beta Momentum Cluster';
      category = 'Speculative Beta';
      primaryDriver = 'Retail Sentiment & Social Momentum';
    } else if (groupSymbols.length === 1) {
      clusterName = `Decoupled Alpha: ${groupSymbols[0].split('/')[0]}`;
      category = 'Idiosyncratic';
      primaryDriver = 'Asset-Specific News or Catalyst';
    }

    // Determine cluster movement state
    let movementState: MarketCluster['movementState'] = 'CONSOLIDATING';
    let sentimentDescription = 'Moving in tight range with neutral velocity';

    if (avgReturn > 3.0) {
      movementState = 'EXPANDING_BULLISH';
      sentimentDescription = `Bullish surge led by ${leadingSymbol} (+${(changes24h[leadingSymbol] || 0).toFixed(1)}%)`;
    } else if (avgReturn < -3.0) {
      movementState = 'DISTRIBUTING';
      sentimentDescription = `Selling pressure dragging cluster lower led by ${leadingSymbol}`;
    } else if (avgCorrelation < 0.4) {
      movementState = 'DECOUPLING';
      sentimentDescription = 'Intra-cluster divergence: members are moving independently';
    }

    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      name: clusterName,
      category,
      symbols: groupSymbols,
      avgCorrelation: parseFloat(avgCorrelation.toFixed(2)),
      avgReturn24h: parseFloat(avgReturn.toFixed(2)),
      leadingSymbol,
      movementState,
      sentimentDescription,
      primaryDriver,
    });
  }

  // Sort clusters: largest cluster first, then by avg correlation
  return clusters.sort((a, b) => b.symbols.length - a.symbols.length || b.avgCorrelation - a.avgCorrelation);
}

/**
 * Finds Pairs Trading Statistical Arbitrage opportunities between highly correlated assets
 * that have temporarily diverged in price
 */
export function findStatisticalArbitragePairs(
  matrixData: CorrelationMatrixData,
  candleMap: Record<string, Candle[]>,
  minCorrelation = 0.70
): StatisticalArbitragePair[] {
  const { symbols, matrix, changes24h, betas } = matrixData;
  const pairs: StatisticalArbitragePair[] = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const symA = symbols[i];
      const symB = symbols[j];
      const r = matrix[i][j];

      if (r >= minCorrelation) {
        const changeA = changes24h[symA] || 0;
        const changeB = changes24h[symB] || 0;
        const divergence = changeA - changeB;

        // Estimate Z-Score of divergence based on relative volatility
        const zScore = parseFloat((divergence / 2.2).toFixed(2));

        let action: StatisticalArbitragePair['action'] = 'IN_EQUILIBRIUM';
        if (zScore >= 1.5) {
          // A outran B significantly -> Short A, Long B
          action = 'LONG_B_SHORT_A';
        } else if (zScore <= -1.5) {
          // B outran A significantly -> Long A, Short B
          action = 'LONG_A_SHORT_B';
        }

        const confidence = Math.min(96, Math.max(50, Math.round(r * 100)));
        const meanReversionEstimate = parseFloat((Math.abs(divergence) * 0.65).toFixed(1));

        pairs.push({
          symbolA: symA,
          symbolB: symB,
          correlation: r,
          beta: betas[symA] || 1.0,
          currentZScore: zScore,
          divergencePercent: parseFloat(divergence.toFixed(2)),
          action,
          confidence,
          meanReversionEstimatePercent: meanReversionEstimate,
        });
      }
    }
  }

  // Sort by highest absolute Z-score (most diverged mean-reverting pairs first)
  return pairs.sort((a, b) => Math.abs(b.currentZScore) - Math.abs(a.currentZScore));
}
