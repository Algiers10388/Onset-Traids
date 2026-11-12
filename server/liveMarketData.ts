/**
 * Real Live Market Data Service
 * Connects directly to Binance US, Kraken, Coinbase Pro, and NonKYC public endpoints.
 * Provides real-time tickers, live candlestick data, and multi-exchange order book quotes.
 * NO simulated data. Real live exchange prices.
 */

export interface LiveTicker {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  sparkline: number[];
  decimals: number;
  volatility: 'Low' | 'Medium' | 'High' | 'Extreme';
  lastUpdated: number;
  category?: string;
  supportedExchanges?: ('BINANCE' | 'COINBASE' | 'KRAKEN' | 'BYBIT' | 'NONKYC')[];
}

export interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ExchangeQuoteResult {
  exchangeId: 'BINANCE' | 'COINBASE' | 'KRAKEN' | 'BYBIT' | 'NONKYC';
  exchangeName: string;
  symbol: string;
  bidPrice: number;
  askPrice: number;
  lastPrice: number;
  volume24h: number | null; // null when the venue does not report it
  spreadUsd: number;
  spreadPercent: number;
  effectiveBuyPrice: number;
  effectiveSellPrice: number;
  depthBidUsd: number;
  depthAskUsd: number;
  latencyMs: number;
  timestamp: number;
  isRealData: boolean;
}

export interface AssetDef {
  symbol: string;
  name: string;
  binanceSymbol: string;
  krakenPair: string;
  krakenKey: string;
  coinbasePair: string;
  nonkycPair: string;
  decimals: number;
  volatility: 'Low' | 'Medium' | 'High' | 'Extreme';
  category: 'Major' | 'DeFi' | 'Meme' | 'Layer 1' | 'Zero-KYC';
  supportedExchanges: ('BINANCE' | 'COINBASE' | 'KRAKEN' | 'BYBIT' | 'NONKYC')[];
}

export const SUPPORTED_ASSETS: AssetDef[] = [
  {
    symbol: 'BTC/USDT',
    name: 'Bitcoin',
    binanceSymbol: 'BTCUSDT',
    krakenPair: 'XBTUSD',
    krakenKey: 'XXBTZUSD',
    coinbasePair: 'BTC-USD',
    nonkycPair: 'BTC_USDT',
    decimals: 2,
    volatility: 'Medium',
    category: 'Major',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'ETH/USDT',
    name: 'Ethereum',
    binanceSymbol: 'ETHUSDT',
    krakenPair: 'ETHUSD',
    krakenKey: 'XETHZUSD',
    coinbasePair: 'ETH-USD',
    nonkycPair: 'ETH_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'Major',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'SOL/USDT',
    name: 'Solana',
    binanceSymbol: 'SOLUSDT',
    krakenPair: 'SOLUSD',
    krakenKey: 'SOLUSD',
    coinbasePair: 'SOL-USD',
    nonkycPair: 'SOL_USDT',
    decimals: 2,
    volatility: 'Extreme',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'XRP/USDT',
    name: 'XRP',
    binanceSymbol: 'XRPUSDT',
    krakenPair: 'XRPUSD',
    krakenKey: 'XXRPZUSD',
    coinbasePair: 'XRP-USD',
    nonkycPair: 'XRP_USDT',
    decimals: 4,
    volatility: 'High',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'BNB/USDT',
    name: 'BNB',
    binanceSymbol: 'BNBUSDT',
    krakenPair: 'BNBUSD',
    krakenKey: 'BNBUSD',
    coinbasePair: 'BNB-USD',
    nonkycPair: 'BNB_USDT',
    decimals: 2,
    volatility: 'Low',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'DOGE/USDT',
    name: 'Dogecoin',
    binanceSymbol: 'DOGEUSDT',
    krakenPair: 'DOGEUSD',
    krakenKey: 'XDGUSD',
    coinbasePair: 'DOGE-USD',
    nonkycPair: 'DOGE_USDT',
    decimals: 4,
    volatility: 'Extreme',
    category: 'Meme',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'KAS/USDT',
    name: 'Kaspa',
    binanceSymbol: 'KASUSDT',
    krakenPair: 'KASUSD',
    krakenKey: 'KASUSD',
    coinbasePair: 'KAS-USD',
    nonkycPair: 'KAS_USDT',
    decimals: 4,
    volatility: 'Extreme',
    category: 'Zero-KYC',
    supportedExchanges: ['NONKYC', 'BYBIT'],
  },
  {
    symbol: 'ADA/USDT',
    name: 'Cardano',
    binanceSymbol: 'ADAUSDT',
    krakenPair: 'ADAUSD',
    krakenKey: 'ADAUSD',
    coinbasePair: 'ADA-USD',
    nonkycPair: 'ADA_USDT',
    decimals: 4,
    volatility: 'Medium',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'LINK/USDT',
    name: 'Chainlink',
    binanceSymbol: 'LINKUSDT',
    krakenPair: 'LINKUSD',
    krakenKey: 'LINKUSD',
    coinbasePair: 'LINK-USD',
    nonkycPair: 'LINK_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'DeFi',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'AVAX/USDT',
    name: 'Avalanche',
    binanceSymbol: 'AVAXUSDT',
    krakenPair: 'AVAXUSD',
    krakenKey: 'AVAXUSD',
    coinbasePair: 'AVAX-USD',
    nonkycPair: 'AVAX_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'LTC/USDT',
    name: 'Litecoin',
    binanceSymbol: 'LTCUSDT',
    krakenPair: 'LTCUSD',
    krakenKey: 'XLTCZUSD',
    coinbasePair: 'LTC-USD',
    nonkycPair: 'LTC_USDT',
    decimals: 2,
    volatility: 'Medium',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'PEPE/USDT',
    name: 'Pepe',
    binanceSymbol: 'PEPEUSDT',
    krakenPair: 'PEPEUSD',
    krakenKey: 'PEPEUSD',
    coinbasePair: 'PEPE-USD',
    nonkycPair: 'PEPE_USDT',
    decimals: 8,
    volatility: 'Extreme',
    category: 'Meme',
    supportedExchanges: ['BINANCE', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'SHIB/USDT',
    name: 'Shiba Inu',
    binanceSymbol: 'SHIBUSDT',
    krakenPair: 'SHIBUSD',
    krakenKey: 'SHIBUSD',
    coinbasePair: 'SHIB-USD',
    nonkycPair: 'SHIB_USDT',
    decimals: 8,
    volatility: 'High',
    category: 'Meme',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'BCH/USDT',
    name: 'Bitcoin Cash',
    binanceSymbol: 'BCHUSDT',
    krakenPair: 'BCHUSD',
    krakenKey: 'BCHUSD',
    coinbasePair: 'BCH-USD',
    nonkycPair: 'BCH_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'UNI/USDT',
    name: 'Uniswap',
    binanceSymbol: 'UNIUSDT',
    krakenPair: 'UNIUSD',
    krakenKey: 'UNIUSD',
    coinbasePair: 'UNI-USD',
    nonkycPair: 'UNI_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'DeFi',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'POL/USDT',
    name: 'Polygon (POL)',
    binanceSymbol: 'POLUSDT',
    krakenPair: 'POLUSD',
    krakenKey: 'POLUSD',
    coinbasePair: 'POL-USD',
    nonkycPair: 'POL_USDT',
    decimals: 4,
    volatility: 'High',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'TRX/USDT',
    name: 'TRON',
    binanceSymbol: 'TRXUSDT',
    krakenPair: 'TRXUSD',
    krakenKey: 'TRXUSD',
    coinbasePair: 'TRX-USD',
    nonkycPair: 'TRX_USDT',
    decimals: 4,
    volatility: 'Low',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'NEAR/USDT',
    name: 'NEAR Protocol',
    binanceSymbol: 'NEARUSDT',
    krakenPair: 'NEARUSD',
    krakenKey: 'NEARUSD',
    coinbasePair: 'NEAR-USD',
    nonkycPair: 'NEAR_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT'],
  },
  {
    symbol: 'SUI/USDT',
    name: 'Sui',
    binanceSymbol: 'SUIUSDT',
    krakenPair: 'SUIUSD',
    krakenKey: 'SUIUSD',
    coinbasePair: 'SUI-USD',
    nonkycPair: 'SUI_USDT',
    decimals: 2,
    volatility: 'Extreme',
    category: 'Layer 1',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT'],
  },
  {
    symbol: 'IMX/USDT',
    name: 'ImmutableX',
    binanceSymbol: 'IMXUSDT',
    krakenPair: 'IMXUSD',
    krakenKey: 'IMXUSD',
    coinbasePair: 'IMX-USD',
    nonkycPair: 'IMX_USDT',
    decimals: 4,
    volatility: 'High',
    category: 'DeFi',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'ARB/USDT',
    name: 'Arbitrum',
    binanceSymbol: 'ARBUSDT',
    krakenPair: 'ARBUSD',
    krakenKey: 'ARBUSD',
    coinbasePair: 'ARB-USD',
    nonkycPair: 'ARB_USDT',
    decimals: 4,
    volatility: 'High',
    category: 'DeFi',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
  {
    symbol: 'XMR/USDT',
    name: 'Monero',
    binanceSymbol: 'XMRUSDT',
    krakenPair: 'XMRUSD',
    krakenKey: 'XXMRZUSD',
    coinbasePair: 'XMR-USD',
    nonkycPair: 'XMR_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'Zero-KYC',
    supportedExchanges: ['NONKYC', 'KRAKEN', 'BYBIT'],
  },
  {
    symbol: 'DASH/USDT',
    name: 'Dash',
    binanceSymbol: 'DASHUSDT',
    krakenPair: 'DASHUSD',
    krakenKey: 'DASHUSD',
    coinbasePair: 'DASH-USD',
    nonkycPair: 'DASH_USDT',
    decimals: 2,
    volatility: 'High',
    category: 'Zero-KYC',
    supportedExchanges: ['BINANCE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  },
];

/**
 * Dynamically resolves any asset definition for any coin on any market
 * (Binance, Coinbase, Kraken, Bybit, NonKYC).
 */
export function getAssetDefinition(symbol: string): AssetDef {
  const norm = symbol.trim().toUpperCase();
  const found = SUPPORTED_ASSETS.find(
    (a) =>
      a.symbol.toUpperCase() === norm ||
      a.symbol.replace('/', '_').toUpperCase() === norm ||
      a.symbol.replace('/', '').toUpperCase() === norm ||
      a.name.toUpperCase() === norm
  );
  if (found) return found;

  // Dynamically resolve any other coin on any market!
  let base = 'BTC';
  let quote = 'USDT';
  if (norm.includes('/')) {
    const parts = norm.split('/');
    base = parts[0];
    quote = parts[1] || 'USDT';
  } else if (norm.includes('_')) {
    const parts = norm.split('_');
    base = parts[0];
    quote = parts[1] || 'USDT';
  } else if (norm.includes('-')) {
    const parts = norm.split('-');
    base = parts[0];
    quote = parts[1] || 'USDT';
  } else if (norm.endsWith('USDT')) {
    base = norm.slice(0, -4);
    quote = 'USDT';
  } else if (norm.endsWith('USD')) {
    base = norm.slice(0, -3);
    quote = 'USD';
  } else {
    base = norm;
    quote = 'USDT';
  }

  const isMeme = ['PEPE', 'SHIB', 'BONK', 'FLOKI', 'WIF', 'DOGE', 'MOODENG', 'POPCAT'].includes(base);
  const isMicro = ['SHIB', 'PEPE', 'BONK', 'FLOKI'].includes(base);
  const decimals = isMicro ? 8 : ['DOGE', 'XRP', 'ADA', 'TRX', 'POL', 'KAS', 'ARB', 'IMX'].includes(base) ? 4 : 2;

  return {
    symbol: `${base}/${quote}`,
    name: base,
    binanceSymbol: `${base}${quote === 'USD' ? 'USDT' : quote}`,
    krakenPair: `${base}USD`,
    krakenKey: `${base}USD`,
    coinbasePair: `${base}-USD`,
    nonkycPair: `${base}_${quote}`,
    decimals,
    volatility: isMeme ? 'Extreme' : 'High',
    category: isMeme ? 'Meme' : 'Zero-KYC',
    supportedExchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'NONKYC'],
  };
}

// In-memory ticker cache with fast TTL for low latency
let cachedTickers: LiveTicker[] = [];
let lastTickerFetchTime = 0;
const TICKER_CACHE_TTL_MS = 1500; // 1.5 seconds

// In-memory candle cache per symbol
const candleCache = new Map<string, { candles: LiveCandle[]; lastFetched: number }>();
const CANDLE_CACHE_TTL_MS = 5000; // 5 seconds

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * 1. Fetch live tickers directly from Binance US, Kraken & NonKYC public APIs.
 * Real exchange data only. Assets with no real data from any venue are omitted,
 * and if no venue responds at all the call throws (nothing is invented or replayed from stale cache).
 */
// Rolling history of REAL observed prices per symbol, used for the sparkline (no synthetic shape).
const priceHistory = new Map<string, number[]>();
const PRICE_HISTORY_MAX = 60;

export class MarketDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataUnavailableError';
  }
}

export async function fetchLiveTickers(): Promise<{ tickers: LiveTicker[]; source: string; timestamp: number }> {
  const now = Date.now();

  // Short-TTL cache of the last real response (de-duplicates bursts of requests; never served after expiry)
  if (cachedTickers.length > 0 && now - lastTickerFetchTime < TICKER_CACHE_TTL_MS) {
    return { tickers: cachedTickers, source: 'live-cache', timestamp: lastTickerFetchTime };
  }

  const newTickers: LiveTicker[] = [];

  let binanceData: any[] | null = null;
  let krakenResult: Record<string, any> = {};
  let nonkycData: any[] | null = null;

  const krakenPairsStr = SUPPORTED_ASSETS.map((a) => a.krakenPair).join(',');

  await Promise.allSettled([
    fetchWithTimeout('https://api.binance.us/api/v3/ticker/24hr', {}, 3000)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d)) binanceData = d;
        }
      })
      .catch(() => {}),

    fetchWithTimeout(`https://api.kraken.com/0/public/Ticker?pair=${krakenPairsStr}`, {}, 3000)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          if (d.result) krakenResult = d.result;
        }
      })
      .catch(() => {}),

    fetchWithTimeout('https://api.nonkyc.io/api/v2/tickers', { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3000)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d)) nonkycData = d;
        }
      })
      .catch(() => {}),
  ]);

  const binanceList: any[] = Array.isArray(binanceData) ? binanceData : [];
  const nonkycList: any[] = Array.isArray(nonkycData) ? nonkycData : [];
  const finite = (...n: number[]) => n.every((x) => Number.isFinite(x));

  for (const def of SUPPORTED_ASSETS) {
    const bMatch = binanceList.find((t: any) => t.symbol === def.binanceSymbol);
    const kKey = Object.keys(krakenResult).find(
      (k) => k === def.krakenKey || k.includes(def.krakenPair.replace('USD', ''))
    );
    const kMatch = kKey ? krakenResult[kKey] : null;
    const nkMatch = nonkycList.find(
      (t: any) =>
        t.ticker_id === def.nonkycPair ||
        t.base_currency === def.name ||
        t.base_currency === def.symbol.split('/')[0]
    );

    let price = 0;
    let change24h = 0;
    let high24h = 0;
    let low24h = 0;
    let volume24h = 0;

    // Each venue is used only if it reports EVERY field; missing fields are never filled in.
    const b = bMatch && {
      price: parseFloat(bMatch.lastPrice),
      change: parseFloat(bMatch.priceChangePercent),
      high: parseFloat(bMatch.highPrice),
      low: parseFloat(bMatch.lowPrice),
      vol: parseFloat(bMatch.quoteVolume),
    };
    const kOpen = kMatch ? parseFloat(kMatch.o) : NaN;
    const k = kMatch && kOpen > 0 && {
      price: parseFloat(kMatch.c[0]),
      change: ((parseFloat(kMatch.c[0]) - kOpen) / kOpen) * 100,
      high: parseFloat(kMatch.h[1]),
      low: parseFloat(kMatch.l[1]),
      vol: parseFloat(kMatch.v[1]) * parseFloat(kMatch.c[0]),
    };
    const n = nkMatch && {
      price: parseFloat(nkMatch.last_price),
      change: parseFloat(nkMatch.change_percent),
      high: parseFloat(nkMatch.high),
      low: parseFloat(nkMatch.low),
      vol: parseFloat(nkMatch.usd_volume_est),
    };

    const pick = [b, k, n].find((v) => v && finite(v.price, v.change, v.high, v.low, v.vol) && v.price > 0);
    if (pick) {
      price = pick.price;
      change24h = pick.change;
      high24h = pick.high;
      low24h = pick.low;
      volume24h = pick.vol;
    }

    if (price > 0) {
      const hist = [...(priceHistory.get(def.symbol) || []), price].slice(-PRICE_HISTORY_MAX);
      priceHistory.set(def.symbol, hist);

      newTickers.push({
        symbol: def.symbol,
        name: def.name,
        price,
        change24h: Number(change24h.toFixed(2)),
        high24h: Number(high24h.toFixed(def.decimals)),
        low24h: Number(low24h.toFixed(def.decimals)),
        volume24h: Math.round(volume24h),
        sparkline: hist,
        decimals: def.decimals,
        volatility: def.volatility,
        category: def.category,
        supportedExchanges: def.supportedExchanges,
        lastUpdated: now,
      });
    }
  }

  if (newTickers.length === 0) {
    throw new MarketDataUnavailableError('No live exchange data available: Binance US, Kraken and NonKYC returned no usable tickers. Refusing to fabricate prices.');
  }

  cachedTickers = newTickers;
  lastTickerFetchTime = now;
  return { tickers: cachedTickers, source: 'live-exchange-feed', timestamp: now };
}

/**
 * 2. Fetch real 1m candles for a symbol from the first venue that actually lists it
 * (Binance US, then Kraken, then Coinbase). Throws if none can supply real candles.
 * Nothing is generated, interpolated, or served stale.
 */
export async function fetchLiveCandles(symbol: string): Promise<LiveCandle[]> {
  const now = Date.now();
  const cached = candleCache.get(symbol);
  if (cached && now - cached.lastFetched < CANDLE_CACHE_TTL_MS) {
    return cached.candles;
  }

  const def = getAssetDefinition(symbol);
  const ok = (c: LiveCandle[]) =>
    c.length > 0 && c.every((x) => [x.time, x.open, x.high, x.low, x.close, x.volume].every(Number.isFinite));

  try {
    const res = await fetchWithTimeout(
      `https://api.binance.us/api/v3/klines?symbol=${def.binanceSymbol}&interval=1m&limit=60`, {}, 3000);
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw)) {
        const parsed: LiveCandle[] = raw.map((k: any) => ({
          time: Number(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
        }));
        if (ok(parsed)) { candleCache.set(symbol, { candles: parsed, lastFetched: now }); return parsed; }
      }
    }
  } catch {}

  try {
    const res = await fetchWithTimeout(
      `https://api.kraken.com/0/public/OHLC?pair=${def.krakenPair}&interval=1`, {}, 3500);
    if (res.ok) {
      const data = await res.json();
      const resultKey = Object.keys(data.result || {}).find((k) => k !== 'last');
      if (resultKey && Array.isArray(data.result[resultKey])) {
        const parsed: LiveCandle[] = data.result[resultKey].slice(-60).map((c: any) => ({
          time: Number(c[0]) * 1000, open: parseFloat(c[1]), high: parseFloat(c[2]),
          low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[6]),
        }));
        if (ok(parsed)) { candleCache.set(symbol, { candles: parsed, lastFetched: now }); return parsed; }
      }
    }
  } catch {}

  try {
    const res = await fetchWithTimeout(
      `https://api.exchange.coinbase.com/products/${def.coinbasePair}/candles?granularity=60`,
      { headers: { 'User-Agent': 'CryptoAgent/1.0' } }, 3500);
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw)) {
        const parsed: LiveCandle[] = raw.slice(0, 60).reverse().map((c: any) => ({
          time: Number(c[0]) * 1000, low: parseFloat(c[1]), high: parseFloat(c[2]),
          open: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]),
        }));
        if (ok(parsed)) { candleCache.set(symbol, { candles: parsed, lastFetched: now }); return parsed; }
      }
    }
  } catch {}

  throw new MarketDataUnavailableError(`No live candle data available for ${symbol}: Binance US, Kraken and Coinbase returned none. Refusing to fabricate candles.`);
}

// Base taker-fee schedule per venue (public fee tiers, NOT account-specific). Used only to
// compute effectiveBuyPrice / effectiveSellPrice.
const TAKER_FEE = { BINANCE: 0.00075, COINBASE: 0.004, KRAKEN: 0.0026, NONKYC: 0.002, BYBIT: 0.001 } as const;

const usdDepth = (levels: any[]): number =>
  levels.reduce((sum, l) => sum + parseFloat(l[0]) * parseFloat(l[1]), 0);

function buildQuote(
  exchangeId: ExchangeQuoteResult['exchangeId'],
  exchangeName: string,
  symbol: string,
  decimals: number,
  q: { bid: number; ask: number; last: number; volume24h: number | null; depthBid: number; depthAsk: number; latencyMs: number },
  now: number
): ExchangeQuoteResult | null {
  if (![q.bid, q.ask, q.last, q.depthBid, q.depthAsk].every((x) => Number.isFinite(x) && x > 0)) return null;
  const fee = TAKER_FEE[exchangeId];
  return {
    exchangeId,
    exchangeName,
    symbol,
    bidPrice: q.bid,
    askPrice: q.ask,
    lastPrice: q.last,
    volume24h: q.volume24h !== null && Number.isFinite(q.volume24h) ? Math.round(q.volume24h) : null,
    spreadUsd: Number((q.ask - q.bid).toFixed(decimals)),
    spreadPercent: Number((((q.ask - q.bid) / q.last) * 100).toFixed(4)),
    effectiveBuyPrice: q.ask * (1 + fee),
    effectiveSellPrice: q.bid * (1 - fee),
    depthBidUsd: Math.round(q.depthBid),
    depthAskUsd: Math.round(q.depthAsk),
    latencyMs: q.latencyMs,
    timestamp: now,
    isRealData: true,
  };
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{ json: any; ms: number } | null> {
  const t0 = Date.now();
  try {
    const r = await fetchWithTimeout(url, { headers }, 3000);
    if (!r.ok) return null;
    return { json: await r.json(), ms: Date.now() - t0 };
  } catch {
    return null;
  }
}

/**
 * 3. Real top-of-book quotes + order-book depth from each venue's public API.
 * A venue that doesn't list the pair, or fails to answer, is simply absent from the result.
 * Throws if no venue returned a real quote.
 */
export async function fetchLiveExchangeQuotes(symbol: string): Promise<ExchangeQuoteResult[]> {
  const def = getAssetDefinition(symbol);
  const now = Date.now();
  const UA = { 'User-Agent': 'Mozilla/5.0' };

  const binance = async () => {
    const [t, d] = await Promise.all([
      getJson(`https://api.binance.us/api/v3/ticker/24hr?symbol=${def.binanceSymbol}`),
      getJson(`https://api.binance.us/api/v3/depth?symbol=${def.binanceSymbol}&limit=20`),
    ]);
    if (!t || !d) return null;
    return buildQuote('BINANCE', 'Binance US (Live Order Book)', symbol, def.decimals, {
      bid: parseFloat(d.json.bids?.[0]?.[0]), ask: parseFloat(d.json.asks?.[0]?.[0]),
      last: parseFloat(t.json.lastPrice), volume24h: parseFloat(t.json.quoteVolume),
      depthBid: usdDepth(d.json.bids || []), depthAsk: usdDepth(d.json.asks || []), latencyMs: d.ms,
    }, now);
  };

  const kraken = async () => {
    const [t, d] = await Promise.all([
      getJson(`https://api.kraken.com/0/public/Ticker?pair=${def.krakenPair}`),
      getJson(`https://api.kraken.com/0/public/Depth?pair=${def.krakenPair}&count=20`),
    ]);
    if (!t || !d) return null;
    const row = (o: any) => { const k = Object.keys(o?.result || {})[0]; return k ? o.result[k] : null; };
    const tr = row(t.json), dr = row(d.json);
    if (!tr || !dr) return null;
    const last = parseFloat(tr.c[0]);
    return buildQuote('KRAKEN', 'Kraken (Live Order Book)', symbol, def.decimals, {
      bid: parseFloat(dr.bids?.[0]?.[0]), ask: parseFloat(dr.asks?.[0]?.[0]), last,
      volume24h: parseFloat(tr.v[1]) * last,
      depthBid: usdDepth(dr.bids || []), depthAsk: usdDepth(dr.asks || []), latencyMs: d.ms,
    }, now);
  };

  const coinbase = async () => {
    const h = { 'User-Agent': 'CryptoAgent/1.0' };
    const [t, b] = await Promise.all([
      getJson(`https://api.exchange.coinbase.com/products/${def.coinbasePair}/ticker`, h),
      getJson(`https://api.exchange.coinbase.com/products/${def.coinbasePair}/book?level=2`, h),
    ]);
    if (!t || !b) return null;
    const last = parseFloat(t.json.price);
    return buildQuote('COINBASE', 'Coinbase Advanced (Live Order Book)', symbol, def.decimals, {
      bid: parseFloat(t.json.bid), ask: parseFloat(t.json.ask), last,
      volume24h: parseFloat(t.json.volume) * last,
      depthBid: usdDepth(b.json.bids || []), depthAsk: usdDepth(b.json.asks || []), latencyMs: b.ms,
    }, now);
  };

  const nonkyc = async () => {
    const [t, o] = await Promise.all([
      getJson(`https://api.nonkyc.io/api/v2/ticker/${def.nonkycPair}`, UA),
      getJson(`https://api.nonkyc.io/api/v2/orderbook?ticker_id=${def.nonkycPair}&depth=20`, UA),
    ]);
    if (!t || !o) return null;
    const vol = parseFloat(t.json.usd_volume_est);
    return buildQuote('NONKYC', 'NonKYC (Live Order Book)', symbol, def.decimals, {
      bid: parseFloat(o.json.bids?.[0]?.[0]), ask: parseFloat(o.json.asks?.[0]?.[0]),
      last: parseFloat(t.json.last_price), volume24h: Number.isFinite(vol) ? vol : null,
      depthBid: usdDepth(o.json.bids || []), depthAsk: usdDepth(o.json.asks || []), latencyMs: o.ms,
    }, now);
  };

  const bybit = async () => {
    const [t, o] = await Promise.all([
      getJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${def.binanceSymbol}`),
      getJson(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${def.binanceSymbol}&limit=25`),
    ]);
    const row = t?.json?.result?.list?.[0];
    const ob = o?.json?.result;
    if (!t || !o || !row || !ob) return null;
    return buildQuote('BYBIT', 'Bybit Spot (Live Order Book)', symbol, def.decimals, {
      bid: parseFloat(row.bid1Price), ask: parseFloat(row.ask1Price), last: parseFloat(row.lastPrice),
      volume24h: parseFloat(row.turnover24h),
      depthBid: usdDepth(ob.b || []), depthAsk: usdDepth(ob.a || []), latencyMs: o.ms,
    }, now);
  };

  const settled = await Promise.allSettled([binance(), coinbase(), kraken(), nonkyc(), bybit()]);
  const quotes = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((q): q is ExchangeQuoteResult => q !== null);

  if (quotes.length === 0) {
    throw new MarketDataUnavailableError(`No live quotes available for ${symbol}: no venue returned a real order book.`);
  }
  return quotes;
}

/**
 * Real 24h ticker for ANY symbol, from the first venue that lists it (Binance US, Kraken, NonKYC).
 * Throws if no venue returns a complete real ticker. Nothing is defaulted.
 */
export async function fetchLiveTickerFor(symbol: string): Promise<LiveTicker> {
  const def = getAssetDefinition(symbol);
  const now = Date.now();
  const fin = (...n: number[]) => n.every((x) => Number.isFinite(x));
  const build = (price: number, change24h: number, high24h: number, low24h: number, volume24h: number): LiveTicker => ({
    symbol: def.symbol, name: def.name, price, change24h: Number(change24h.toFixed(2)),
    high24h, low24h, volume24h: Math.round(volume24h), sparkline: [price], decimals: def.decimals,
    volatility: def.volatility, category: def.category, supportedExchanges: def.supportedExchanges, lastUpdated: now,
  });

  const b = await getJson(`https://api.binance.us/api/v3/ticker/24hr?symbol=${def.binanceSymbol}`);
  if (b) {
    const j = b.json;
    const v = [parseFloat(j.lastPrice), parseFloat(j.priceChangePercent), parseFloat(j.highPrice), parseFloat(j.lowPrice), parseFloat(j.quoteVolume)];
    if (fin(...v) && v[0] > 0) return build(v[0], v[1], v[2], v[3], v[4]);
  }
  const k = await getJson(`https://api.kraken.com/0/public/Ticker?pair=${def.krakenPair}`);
  const kRow = k && Object.values<any>(k.json?.result || {})[0];
  if (kRow) {
    const price = parseFloat(kRow.c[0]), open = parseFloat(kRow.o);
    const v = [price, ((price - open) / open) * 100, parseFloat(kRow.h[1]), parseFloat(kRow.l[1]), parseFloat(kRow.v[1]) * price];
    if (fin(...v) && open > 0 && price > 0) return build(v[0], v[1], v[2], v[3], v[4]);
  }
  const n = await getJson(`https://api.nonkyc.io/api/v2/ticker/${def.nonkycPair}`, { 'User-Agent': 'Mozilla/5.0' });
  if (n) {
    const j = n.json;
    const v = [parseFloat(j.last_price), parseFloat(j.change_percent), parseFloat(j.high), parseFloat(j.low), parseFloat(j.usd_volume_est)];
    if (fin(...v) && v[0] > 0) return build(v[0], v[1], v[2], v[3], v[4]);
  }
  throw new MarketDataUnavailableError(`No venue returned a complete live ticker for ${symbol}.`);
}
