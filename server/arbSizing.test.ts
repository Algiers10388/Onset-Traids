// Run: npx tsx --test server/arbSizing.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizeArbitrage } from './arbSizing.ts';

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
