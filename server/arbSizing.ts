/**
 * Flash-arb trade sizing from MEASURED pool depth.
 *
 * Each leg trades on a constant-product-equivalent curve whose quote-side virtual reserve is the measured depth R (USD).
 * A trade of size S moves that pool's price by ~S/R; the average slippage paid is half that, so
 *   profit(S) = S*edge - (S^2/2) * (1/R_buy + 1/R_sell) - gas
 * which is maximised at S* = edge / (1/R_buy + 1/R_sell). The approximation only holds for small moves, so S is also
 * capped at maxDepthFraction of the shallower pool. Unmeasured depth (NaN / <=0) yields null: no opportunity.
 */
export const MAX_DEPTH_FRACTION = 0.05;

export function computeAdaptiveDepthFraction(netEdgeBps: number): number {
  if (!Number.isFinite(netEdgeBps) || netEdgeBps < 12) return MAX_DEPTH_FRACTION;
  if (netEdgeBps >= 50) return 0.11;
  if (netEdgeBps >= 25) return 0.08;
  return 0.065;
}

export interface SizingInput {
  netEdgeBps: number;      // spread after DEX fees, in bps
  depthBuyUsd: number;     // measured quote-side virtual reserve of the buy pool
  depthSellUsd: number;    // measured quote-side virtual reserve of the sell pool
  buyPrice: number;        // USD per unit of the loan asset
  gasCostUsd: number;
  autoOptimize: boolean;   // true: S*, false: fixed fixedClipUsd
  fixedClipUsd?: number;
  minLoanUnits?: number;
  maxLoanUnits?: number;
  maxDepthFraction?: number;
  maxTradeUsd?: number;    // optional single-sided physical pool / Balancer vault cap (USD)
}

export interface SizingResult {
  loanUnits: number;
  tradeUsd: number;
  priceImpactBps: number;      // total price movement across both legs at this size
  slippageCostUsd: number;
  netProfitUsd: number;
  overDepth: boolean;          // even the chosen clip exceeds maxDepthFraction of the shallower pool
  shallowDepthUsd: number;
}

export function loanUnitPrecision(buyPrice: number): number {
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) return 2;
  if (buyPrice >= 10000) return 6;
  if (buyPrice >= 100) return 5;
  if (buyPrice >= 1) return 3;
  return 2;
}

export function sizeArbitrage(i: SizingInput): SizingResult | null {
  const { depthBuyUsd: dA, depthSellUsd: dB } = i;
  if (!Number.isFinite(dA) || !Number.isFinite(dB) || dA <= 0 || dB <= 0) return null;
  if (!Number.isFinite(i.buyPrice) || i.buyPrice <= 0) return null;

  const minUnits = i.minLoanUnits ?? 0.5;
  const maxUnits = i.maxLoanUnits ?? 15;
  const frac = i.maxDepthFraction ?? MAX_DEPTH_FRACTION;
  const invSum = 1 / dA + 1 / dB;
  const shallow = Math.min(dA, dB);
  const effectiveCapUsd =
    Number.isFinite(i.maxTradeUsd) && (i.maxTradeUsd as number) > 0
      ? Math.min(shallow * frac, i.maxTradeUsd as number)
      : shallow * frac;

  const edge = i.netEdgeBps / 10000;
  let targetUsd: number;
  if (edge > 0) {
    targetUsd = i.autoOptimize ? edge / invSum : (i.fixedClipUsd ?? 10000);
    targetUsd = Math.min(targetUsd, effectiveCapUsd);
  } else {
    targetUsd = i.buyPrice; // report the modelled loss at a 1-unit clip
  }

  const rawUnits = targetUsd / i.buyPrice;
  const unitDecimals = loanUnitPrecision(i.buyPrice);
  const clampedUnits = Math.max(minUnits, Math.min(maxUnits, rawUnits));
  const loanUnits = edge > 0 ? Number(clampedUnits.toFixed(unitDecimals)) : 1;
  const tradeUsd = loanUnits * i.buyPrice;
  const slippageCostUsd = (tradeUsd * tradeUsd / 2) * invSum;
  const rawNetProfitUsd = tradeUsd * edge - slippageCostUsd - i.gasCostUsd;
  const profitDecimals = Math.abs(rawNetProfitUsd) < 1 ? 4 : 2;
  return {
    loanUnits,
    tradeUsd,
    priceImpactBps: Number((tradeUsd * invSum * 10000).toFixed(2)),
    slippageCostUsd,
    netProfitUsd: Number(rawNetProfitUsd.toFixed(profitDecimals)),
    overDepth: edge > 0 && tradeUsd > effectiveCapUsd,
    shallowDepthUsd: shallow,
  };
}
