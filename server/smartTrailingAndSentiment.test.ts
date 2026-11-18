import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSmartTrailingPercent } from '../src/utils/cryptoMath.ts';
import { parseRssItems } from './sentimentRoutes.ts';

test('calculateSmartTrailingPercent scales trailing distance dynamically with ATR volatility and leverage', () => {
  // Low volatility: $300 ATR on $60,000 BTC (0.50% ATR) * 1.5x = 0.75% spot
  const lowVol = calculateSmartTrailingPercent({
    atr: 300,
    currentPrice: 60000,
    atrMultiplier: 1.5,
    leverage: 1,
  });
  assert.equal(lowVol.atrPercent, 0.5);
  assert.equal(lowVol.spotTrailPercent, 0.75);
  assert.equal(lowVol.trailingPercent, 0.75);
  assert.equal(lowVol.volatilityRegime, 'LOW');

  // Elevated volatility: $1,800 ATR on $60,000 BTC (3.00% ATR) * 1.5x = 4.50% spot, 2x lev = 9.00%
  const highVol = calculateSmartTrailingPercent({
    atr: 1800,
    currentPrice: 60000,
    atrMultiplier: 1.5,
    leverage: 2,
  });
  assert.equal(highVol.atrPercent, 3);
  assert.equal(highVol.spotTrailPercent, 4.5);
  assert.equal(highVol.trailingPercent, 9);
  assert.equal(highVol.volatilityRegime, 'ELEVATED');

  // Clamping: extreme ATR + high leverage caps at maxPercent (default 15%), tiny ATR floors at minPercent (0.5%)
  const extremeClamped = calculateSmartTrailingPercent({
    atr: 5000,
    currentPrice: 60000,
    atrMultiplier: 2.5,
    leverage: 5,
  });
  assert.equal(extremeClamped.volatilityRegime, 'EXTREME');
  assert.equal(extremeClamped.trailingPercent, 15);

  const tinyFloored = calculateSmartTrailingPercent({
    atr: 10,
    currentPrice: 60000,
    atrMultiplier: 1.0,
    leverage: 1,
  });
  assert.equal(tinyFloored.trailingPercent, 0.5);
});

test('parseRssItems extracts CoinDesk/Cointelegraph RSS articles, strips HTML, and detects crypto tickers', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title><![CDATA[Bitcoin &amp; Ethereum Rally as Solana Volume Surges]]></title>
        <link>https://www.coindesk.com/markets/2026/11/17/btc-eth-sol</link>
        <pubDate>Tue, 17 Nov 2026 17:00:00 +0000</pubDate>
        <category>BTC</category>
        <description><![CDATA[<p>Spot ETF inflows lift <strong>Bitcoin</strong> and ETH prices.</p>]]></description>
      </item>
    </channel>
  </rss>`;

  const items = parseRssItems(sampleXml, 'COINDESK', 'CoinDesk');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Bitcoin & Ethereum Rally as Solana Volume Surges');
  assert.equal(items[0].body, 'Spot ETF inflows lift Bitcoin and ETH prices.');
  assert.equal(items[0].url, 'https://www.coindesk.com/markets/2026/11/17/btc-eth-sol');
  assert.equal(items[0].source, 'COINDESK');
  assert.equal(items[0].sourceName, 'CoinDesk');
  const tickers = new Set(items[0].categories.split('|'));
  assert.ok(tickers.has('BTC'));
  assert.ok(tickers.has('ETH'));
  assert.ok(tickers.has('SOL'));
});
