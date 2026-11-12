// Run: npx tsx --test server/marketData.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fetchLiveCandles, MarketDataUnavailableError } = await import('./liveMarketData.ts');

test('when every live feed fails, candles are NOT fabricated: it throws', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
  try {
    await assert.rejects(() => fetchLiveCandles('BTC/USDT'), (e: any) => e instanceof MarketDataUnavailableError && /Refusing to fabricate/.test(e.message));
  } finally { globalThis.fetch = real; }
});

test('real Binance klines are passed through untouched', async () => {
  const real = globalThis.fetch;
  const k = (t: number, o: number) => [t, String(o), String(o + 2), String(o - 1), String(o + 1), '10'];
  globalThis.fetch = (async (url: any) => String(url).includes('binance.us')
    ? { ok: true, status: 200, json: async () => [k(1000, 100), k(61000, 101)] }
    : { ok: false, status: 500, json: async () => ({}) }) as any;
  try {
    const c = await fetchLiveCandles('ETH/USDT');
    assert.deepEqual(c.map((x: any) => x.open), [100, 101]);
  } finally { globalThis.fetch = real; }
});

test('when every venue fails, quotes and tickers are NOT fabricated: they throw', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
  try {
    const { fetchLiveExchangeQuotes, fetchLiveTickers } = await import('./liveMarketData.ts');
    await assert.rejects(() => fetchLiveExchangeQuotes('BTC/USDT'), (e: any) => e instanceof MarketDataUnavailableError);
    await assert.rejects(() => fetchLiveTickers(), (e: any) => e instanceof MarketDataUnavailableError);
  } finally { globalThis.fetch = real; }
});

test('Binance quote uses the real order book for depth (no multipliers) and measured latency', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes('binance.us') && u.includes('ticker/24hr')) return { ok: true, status: 200, json: async () => ({ lastPrice: '100', quoteVolume: '5000' }) };
    if (u.includes('binance.us') && u.includes('depth')) return { ok: true, status: 200, json: async () => ({ bids: [['99', '2'], ['98', '1']], asks: [['101', '3']] }) };
    return { ok: false, status: 500, json: async () => ({}) };
  }) as any;
  try {
    const { fetchLiveExchangeQuotes } = await import('./liveMarketData.ts');
    const q = (await fetchLiveExchangeQuotes('ETH/USDT')).find((x: any) => x.exchangeId === 'BINANCE');
    assert.ok(q);
    assert.equal(q!.depthBidUsd, 99 * 2 + 98 * 1);
    assert.equal(q!.depthAskUsd, 101 * 3);
    assert.equal(q!.volume24h, 5000);
  } finally { globalThis.fetch = real; }
});
