// Run: npx tsx --test server/arbSizing.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizeArbitrage, loanUnitPrecision } from './arbSizing.ts';

const base = { netEdgeBps: 20, depthBuyUsd: 50_000_000, depthSellUsd: 5_000_000, buyPrice: 2400, gasCostUsd: 0.05, autoOptimize: true };

test('unmeasured / invalid depth => no opportunity (never invented)', () => {
  assert.equal(sizeArbitrage({ ...base, depthSellUsd: NaN }), null);
  assert.equal(sizeArbitrage({ ...base, depthBuyUsd: 0 }), null);
  assert.equal(sizeArbitrage({ ...base, buyPrice: 0 }), null);
});

test('S* maximises modelled profit (neighbouring sizes are not better)', () => {
  const r = sizeArbitrage({ ...base, maxLoanUnits: 1e9, minLoanUnits: 0.0001, maxDepthFraction: 1 })!;
  const profitAt = (units: number) => sizeArbitrage({ ...base, autoOptimize: false, fixedClipUsd: units * base.buyPrice, maxLoanUnits: 1e9, minLoanUnits: 0.0001, maxDepthFraction: 1 })!.netProfitUsd;
  assert.ok(r.netProfitUsd >= profitAt(r.loanUnits * 0.5));
  assert.ok(r.netProfitUsd >= profitAt(r.loanUnits * 1.5));
});

test('size follows the SHALLOWER measured pool, not a fixed number', () => {
  const deep = sizeArbitrage({ ...base, depthSellUsd: 50_000_000, maxLoanUnits: 1e9 })!;
  const thin = sizeArbitrage({ ...base, depthSellUsd: 200_000, maxLoanUnits: 1e9 })!;
  assert.ok(thin.tradeUsd < deep.tradeUsd);
  assert.ok(thin.tradeUsd <= 200_000 * 0.05 + 1e-6); // capped at 5% of shallow depth
});

test('thin pool + minimum clip bigger than the safe fraction => blocked as over-depth', () => {
  const r = sizeArbitrage({ ...base, depthBuyUsd: 100_000, depthSellUsd: 100_000 })!; // min clip 0.5*2400=$1200 < 5% of 100k=$5000 -> ok
  assert.equal(r.overDepth, false);
  const t = sizeArbitrage({ ...base, depthBuyUsd: 10_000, depthSellUsd: 10_000 })!; // 5% = $500 < $1200 min clip
  assert.equal(t.overDepth, true);
});

test('price impact and slippage grow with size; edge below fees is a modelled loss', () => {
  const small = sizeArbitrage({ ...base, autoOptimize: false, fixedClipUsd: 1000, minLoanUnits: 0.0001 })!;
  const big = sizeArbitrage({ ...base, autoOptimize: false, fixedClipUsd: 30000, minLoanUnits: 0.0001 })!;
  assert.ok(big.priceImpactBps > small.priceImpactBps && big.slippageCostUsd > small.slippageCostUsd);
  const neg = sizeArbitrage({ ...base, netEdgeBps: -5 })!;
  assert.ok(neg.netProfitUsd < 0);
});

test('L2-calibrated minLoanUnits unlocks profitable S* clips that legacy 0.5 ETH floor turned into losses', () => {
  // Real L2 scenario: +10 bps edge on $600k vs $400k pools -> S* = $240, max profit = $0.12 - $0.005 gas = +$0.115
  const l2Scenario = {
    netEdgeBps: 10,
    depthBuyUsd: 600_000,
    depthSellUsd: 400_000,
    buyPrice: 1800,
    gasCostUsd: 0.005,
    autoOptimize: true,
  };
  const legacy = sizeArbitrage({ ...l2Scenario, minLoanUnits: 0.5 })!; // $900 clip over-borrows past 2*S* ($480) -> negative!
  assert.ok(legacy.netProfitUsd < 0);

  const optimized = sizeArbitrage({ ...l2Scenario, minLoanUnits: 1 / 1800, maxLoanUnits: 100 })!;
  assert.equal(optimized.overDepth, false);
  assert.ok(optimized.netProfitUsd > 0.10);
});

test('adaptive loanUnitPrecision preserves high-price WBTC/WETH optimal clips without rounding to zero', () => {
  assert.equal(loanUnitPrecision(65000), 6);
  assert.equal(loanUnitPrecision(1800), 5);
  assert.equal(loanUnitPrecision(1.5), 3);

  const btcArb = sizeArbitrage({
    netEdgeBps: 12,
    depthBuyUsd: 800_000,
    depthSellUsd: 400_000,
    buyPrice: 65000,
    gasCostUsd: 0.005,
    autoOptimize: true,
    minLoanUnits: 1 / 65000,
    maxLoanUnits: (100 * 1800) / 65000,
  })!;
  // S* = 0.0012 / (1/800k + 1/400k) = $320 -> 0.004923 WBTC (legacy .toFixed(2) rounded this to 0.00!)
  assert.ok(btcArb.loanUnits > 0.004 && btcArb.loanUnits < 0.006);
  assert.ok(btcArb.netProfitUsd > 0.15);
});

test('concentrated V3 virtual depth unlocks higher S* profit while maxTradeUsd caps physical pool reserve', () => {
  // Concentrated V3 pool: virtual in-range depth = $20M / $10M, physical single-sided reserve cap = $5,000
  const unclamped = sizeArbitrage({
    netEdgeBps: 15,
    depthBuyUsd: 20_000_000,
    depthSellUsd: 10_000_000,
    buyPrice: 2000,
    gasCostUsd: 0.005,
    autoOptimize: true,
    minLoanUnits: 0.0005,
    maxLoanUnits: 100,
    maxTradeUsd: 5000,
  })!;
  // S* = 0.0015 / (1/20M + 1/10M) = $10,000 -> capped cleanly at maxTradeUsd ($5,000 = 2.5 WETH)
  assert.equal(unclamped.overDepth, false);
  assert.equal(unclamped.loanUnits, 2.5);
  assert.ok(unclamped.netProfitUsd > 5.0);

  // If clamped down to TVL ($100k/$100k) instead of virtual depth, S* collapses to $75 and profit drops >60x
  const clampedToTvl = sizeArbitrage({
    netEdgeBps: 15,
    depthBuyUsd: 100_000,
    depthSellUsd: 100_000,
    buyPrice: 2000,
    gasCostUsd: 0.005,
    autoOptimize: true,
    minLoanUnits: 0.0005,
    maxLoanUnits: 100,
  })!;
  assert.ok(unclamped.netProfitUsd > clampedToTvl.netProfitUsd * 20);
});

test('computeAdaptiveDepthFraction unlocks higher dollar profit on wide edges without violating caps', async () => {
  const { computeAdaptiveDepthFraction } = await import('./arbSizing.ts');
  assert.equal(computeAdaptiveDepthFraction(5), 0.05);
  assert.equal(computeAdaptiveDepthFraction(15), 0.065);
  assert.equal(computeAdaptiveDepthFraction(30), 0.08);

  const conservative = sizeArbitrage({
    netEdgeBps: 1000,
    depthBuyUsd: 500_000,
    depthSellUsd: 200_000,
    buyPrice: 2000,
    gasCostUsd: 0.01,
    autoOptimize: true,
    minLoanUnits: 0.001,
    maxLoanUnits: 150,
    maxDepthFraction: computeAdaptiveDepthFraction(5),
  })!;
  const adaptive = sizeArbitrage({
    netEdgeBps: 1000,
    depthBuyUsd: 500_000,
    depthSellUsd: 200_000,
    buyPrice: 2000,
    gasCostUsd: 0.01,
    autoOptimize: true,
    minLoanUnits: 0.001,
    maxLoanUnits: 150,
    maxDepthFraction: computeAdaptiveDepthFraction(1000),
  })!;
  assert.equal(adaptive.overDepth, false);
  assert.ok(adaptive.tradeUsd > conservative.tradeUsd);
  assert.ok(adaptive.netProfitUsd > conservative.netProfitUsd);
});
