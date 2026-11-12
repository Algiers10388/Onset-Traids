// ==============================================================================
// Autonomous Crypto Trading Agent: Multi-Exchange Execution Engine
// LIVE ONLY: Binance and OKX spot. There is no paper/simulated execution path.
//
// Key behaviours (changed from the original):
//  * Market data comes ONLY from real public feeds (Binance mirror -> Binance ->
//    Binance.US -> OKX -> Bybit). If every feed fails, fetchCandles THROWS
//    MarketDataError and the agent skips the tick. It never trades on fake data.
//  * Every order is a real exchange order. Fill price, quantity and fee come from
//    the exchange's response; quantities are floored to the symbol's lot size and
//    a BUY's quantity is net of commission taken in the base asset, so the later
//    SELL never asks for more than is actually held.
//  * Execution is spot-only and sells the real held quantity.
// ==============================================================================

import crypto from 'node:crypto';
import { Candle } from './indicators.js';

export type SupportedExchange = 'BINANCE' | 'OKX';

export interface ExchangeCredentials {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string; // OKX, Coinbase
  isTestnet?: boolean;
  /** OKX site host. Keys only exist on the site they were created on: www.okx.com (global), eea.okx.com (EEA), app.okx.com (US). */
  okxHost?: string;
}

export interface TradeOrderRequest {
  symbol: string; // e.g. 'BTC/USDT'
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  /** Margin in USD to commit (BUY). */
  amountUsd: number;
  leverage?: number;
  price?: number;
  clientOrderId?: string;
  /** Price the strategy saw when it decided to trade (used to size the order). */
  referencePrice?: number;
  /** Base-asset quantity. For SELL, pass the quantity that was bought. */
  quantity?: number;
}

export interface TradeOrderResult {
  success: boolean;
  orderId: string;
  exchange: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  executedPrice: number;
  quantity: number;
  notionalUsd: number;
  feeUsd: number; // only fees the exchange reported in USDT/base asset; never estimated
  feeComplete?: boolean; // false when part of the fee was charged in an asset (e.g. BNB) we cannot value here
  timestamp: number;
  isSimulated: boolean;
  rawResponse?: any;
  error?: string;
}

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataError';
  }
}

const HTTP_TIMEOUT_MS = 6000;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CryptoTradeAgent/1.1' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const okxBar = (i: string) => (i.endsWith('h') ? i.toUpperCase() : i);
const bybitInterval = (i: string) => (i === '1h' ? '60' : i.replace('m', ''));

export class ExchangeClient {
  private exchange: SupportedExchange;
  private creds: ExchangeCredentials;
  private lastPrice = new Map<string, number>();
  private stepSizes = new Map<string, number>();
  public lastSource = 'none';

  constructor(exchange: SupportedExchange, creds: ExchangeCredentials) {
    this.exchange = exchange;
    this.creds = creds;
  }

  public getExchange(): SupportedExchange {
    return this.exchange;
  }

  /** Non-secret description of what we are connecting with, for the startup banner. */
  public describeConnection(): string {
    const k = this.creds.apiKey || '';
    const keyInfo = k ? `key ${k.slice(0, 4)}...${k.slice(-4)} (${k.length} chars)` : 'no key';
    const where = this.exchange === 'OKX' ? this.okxBase() : this.binanceBase();
    return `${keyInfo} -> ${where}${this.creds.isTestnet ? ' [TESTNET/DEMO]' : ''}`;
  }

  private okxBase(): string {
    const h = (this.creds.okxHost || 'www.okx.com').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${h}`;
  }

  public hasCredentials(): boolean {
    return !!this.creds.apiKey && !!this.creds.apiSecret && (this.exchange !== 'OKX' || !!this.creds.passphrase);
  }

  // ---------------------------------------------------------------------------
  // Market data
  // ---------------------------------------------------------------------------
  public async fetchCandles(symbol = 'BTC/USDT', interval = '1m', limit = 100): Promise<Candle[]> {
    const pair = symbol.replace('/', '').toUpperCase();
    const [base, quote] = symbol.toUpperCase().split('/');
    const sources: Array<{ name: string; run: () => Promise<Candle[]> }> = [
      ...['https://data-api.binance.vision', 'https://api.binance.com', 'https://api.binance.us'].map((host) => ({
        name: host.replace('https://', ''),
        run: async () => {
          const raw = (await getJson(`${host}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`)) as any[];
          return raw.map((k) => ({
            timestamp: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
        },
      })),
      {
        name: 'okx.com',
        run: async () => {
          const j = await getJson(
            `https://www.okx.com/api/v5/market/candles?instId=${base}-${quote}&bar=${okxBar(interval)}&limit=${Math.min(limit, 300)}`
          );
          if (j.code !== '0') throw new Error(`OKX code ${j.code}`);
          return (j.data as string[][])
            .map((k) => ({
              timestamp: Number(k[0]),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
            }))
            .reverse(); // OKX returns newest first
        },
      },
      {
        name: 'bybit.com',
        run: async () => {
          const j = await getJson(
            `https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=${bybitInterval(interval)}&limit=${Math.min(limit, 1000)}`
          );
          if (j.retCode !== 0) throw new Error(`Bybit retCode ${j.retCode}`);
          return (j.result.list as string[][])
            .map((k) => ({
              timestamp: Number(k[0]),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
            }))
            .reverse(); // Bybit returns newest first
        },
      },
    ];

    const errors: string[] = [];
    for (const src of sources) {
      try {
        const candles = await src.run();
        if (candles.length >= 2 && candles.every((c) => Number.isFinite(c.close) && c.close > 0)) {
          this.lastSource = src.name;
          this.lastPrice.set(symbol, candles[candles.length - 1].close);
          return candles;
        }
        errors.push(`${src.name}: empty/invalid`);
      } catch (e: any) {
        errors.push(`${src.name}: ${e?.message || e}`);
      }
    }
    throw new MarketDataError(`All market data feeds failed for ${symbol} (${errors.join('; ')})`);
  }

  /** Latest traded price (last close of the freshest 1m candle). */
  public async fetchPrice(symbol = 'BTC/USDT'): Promise<number> {
    const c = await this.fetchCandles(symbol, '1m', 2);
    return c[c.length - 1].close;
  }

  // ---------------------------------------------------------------------------
  // Order execution
  // ---------------------------------------------------------------------------
  public async executeOrder(req: TradeOrderRequest): Promise<TradeOrderResult> {
    if (!this.hasCredentials()) return this.failure(req, 'Exchange API credentials are missing (API_KEY / API_SECRET' + (this.exchange === 'OKX' ? ' / API_PASSPHRASE' : '') + ').');

    let refPrice = req.referencePrice;
    if (!refPrice || refPrice <= 0) {
      refPrice = this.lastPrice.get(req.symbol) ?? (await this.fetchPrice(req.symbol));
    }
    // Spot: no leverage. Quantity is margin / price for a BUY, or the exact held quantity for a SELL.
    const quantity = req.quantity ?? req.amountUsd / refPrice;

    try {
      if (this.exchange === 'BINANCE') return await this.executeBinanceOrder(req, refPrice, quantity);
      return await this.executeOKXOrder(req, refPrice, quantity);
    } catch (err: any) {
      return this.failure(req, err?.message || String(err));
    }
  }

  /** Free balance of an asset (e.g. USDT) on the connected account. Used to size the agent from real capital. */
  public async fetchQuoteBalance(asset = 'USDT'): Promise<number> {
    if (!this.hasCredentials()) throw new Error('Exchange API credentials are missing.');
    if (this.exchange === 'BINANCE') {
      const ts = Date.now();
      const qs = `timestamp=${ts}&recvWindow=10000`;
      const sig = crypto.createHmac('sha256', this.creds.apiSecret || '').update(qs).digest('hex');
      const res = await fetch(`${this.binanceBase()}/account?${qs}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': this.creds.apiKey || '' },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(`Binance balance error (${res.status}): ${data.msg || JSON.stringify(data)}`);
      const bal = (data.balances as any[]).find((b) => b.asset === asset);
      return bal ? parseFloat(bal.free) : 0;
    }
    const path = `/api/v5/account/balance?ccy=${asset}`;
    const data = await this.okxRequest('GET', path, '');
    const det = data?.data?.[0]?.details?.find((d: any) => d.ccy === asset);
    return det ? parseFloat(det.availBal) : 0;
  }

  private failure(req: TradeOrderRequest, error: string): TradeOrderResult {
    return {
      success: false,
      orderId: 'ERR_' + Date.now(),
      exchange: this.exchange,
      symbol: req.symbol,
      side: req.side,
      executedPrice: 0,
      quantity: 0,
      notionalUsd: 0,
      feeUsd: 0,
      timestamp: Date.now(),
      isSimulated: false,
      error,
    };
  }

  private binanceBase(): string {
    return this.creds.isTestnet ? 'https://testnet.binance.vision/api/v3' : 'https://api.binance.com/api/v3';
  }

  /** LOT_SIZE stepSize for a Binance symbol (cached). Orders that are not a multiple of it are rejected. */
  private async binanceStepSize(symbolClean: string): Promise<number> {
    const cached = this.stepSizes.get(symbolClean);
    if (cached) return cached;
    const j = await getJson(`${this.binanceBase()}/exchangeInfo?symbol=${symbolClean}`);
    const lot = (j.symbols?.[0]?.filters as any[] | undefined)?.find((f) => f.filterType === 'LOT_SIZE');
    const step = lot ? parseFloat(lot.stepSize) : NaN;
    if (!Number.isFinite(step) || step <= 0) throw new Error(`Could not read LOT_SIZE for ${symbolClean}`);
    this.stepSizes.set(symbolClean, step);
    return step;
  }

  // Binance HMAC-SHA256 authenticated spot market order
  private async executeBinanceOrder(req: TradeOrderRequest, refPrice: number, quantity: number): Promise<TradeOrderResult> {
    if (req.orderType !== 'MARKET') throw new Error('Only MARKET orders are supported for live Binance execution');
    const symbolClean = req.symbol.replace('/', '').toUpperCase();
    const baseAsset = symbolClean.replace(/USDT$/, '');
    const step = await this.binanceStepSize(symbolClean);
    const qty = floorToStep(quantity, step);
    if (qty <= 0) throw new Error(`Order quantity ${quantity} is below the minimum lot size ${step} for ${symbolClean}`);

    const timestamp = Date.now();
    const qtyStr = qty.toFixed(decimalsOf(step));
    const queryString = `symbol=${symbolClean}&side=${req.side}&type=MARKET&quantity=${qtyStr}&newOrderRespType=FULL&recvWindow=10000&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', this.creds.apiSecret || '').update(queryString).digest('hex');

    const res = await fetch(`${this.binanceBase()}/order?${queryString}&signature=${signature}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.creds.apiKey || '' },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(`Binance API error (${res.status}): ${data.msg || JSON.stringify(data)}`);

    const execQty = parseFloat(data.executedQty) || 0;
    const quoteQty = parseFloat(data.cummulativeQuoteQty) || 0;
    if (execQty <= 0) throw new Error(`Binance order ${data.orderId} executed 0 (status ${data.status})`);
    const avgPrice = quoteQty / execQty;

    // Commission can be charged in the base asset (reducing what we hold) or in USDT/BNB.
    let commissionUsd = 0;
    let commissionInBase = 0;
    let feeComplete = true;
    for (const f of (data.fills as any[] | undefined) ?? []) {
      const c = parseFloat(f.commission) || 0;
      if (f.commissionAsset === baseAsset) {
        commissionInBase += c;
        commissionUsd += c * (parseFloat(f.price) || avgPrice);
      } else if (f.commissionAsset === 'USDT') {
        commissionUsd += c;
      } else {
        feeComplete = false; // paid in BNB etc.: not valued, see rawResponse.fills
      }
    }
    const heldQty = req.side === 'BUY' ? execQty - commissionInBase : execQty;

    return {
      success: true,
      orderId: data.orderId?.toString() || 'BINANCE_' + timestamp,
      exchange: 'BINANCE (LIVE)',
      symbol: req.symbol,
      side: req.side,
      executedPrice: avgPrice,
      quantity: heldQty,
      notionalUsd: quoteQty,
      feeUsd: commissionUsd,
      feeComplete,
      timestamp,
      isSimulated: false,
      rawResponse: data,
    };
  }

  private async okxRequest(method: 'GET' | 'POST', requestPath: string, bodyStr: string): Promise<any> {
    const timestamp = new Date().toISOString();
    const sign = crypto.createHmac('sha256', this.creds.apiSecret || '').update(timestamp + method + requestPath + bodyStr).digest('base64');
    const headers: Record<string, string> = {
      'OK-ACCESS-KEY': this.creds.apiKey || '',
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.creds.passphrase || '',
      'Content-Type': 'application/json',
    };
    if (this.creds.isTestnet) headers['x-simulated-trading'] = '1';
    const res = await fetch(this.okxBase() + requestPath, {
      method,
      headers,
      body: method === 'POST' ? bodyStr : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const data = (await res.json()) as any;
    if (!res.ok || data.code !== '0') {
      const hints: Record<string, string> = {
        '50119': `The key does not exist on ${this.okxBase()}. Check: (1) the key was created on THIS OKX site (set OKX_HOST=eea.okx.com or app.okx.com for EEA/US accounts); (2) demo-trading keys need TESTNET=1 and live keys must NOT have it; (3) no quotes/spaces around the value in .env.`,
        '50111': 'Invalid API key. Check for typos or stray characters in API_KEY.',
        '50113': 'Invalid signature. Check API_SECRET (and that the system clock is correct).',
        '50105': 'Wrong API passphrase: use the passphrase you typed when creating the key, not your account password.',
        '50110': 'This machine\'s IP is not on the key\'s IP allowlist.',
      };
      const hint = hints[String(data.code)];
      throw new Error(`OKX API error (${data.code}): ${data.data?.[0]?.sMsg || data.msg || JSON.stringify(data)}${hint ? ' | ' + hint : ''}`);
    }
    return data;
  }

  // OKX V5 authenticated spot market order; fill details are read back from the order record.
  private async executeOKXOrder(req: TradeOrderRequest, refPrice: number, quantity: number): Promise<TradeOrderResult> {
    if (req.orderType !== 'MARKET') throw new Error('Only MARKET orders are supported for live OKX execution');
    const instId = req.symbol.replace('/', '-').toUpperCase();
    const baseAsset = instId.split('-')[0];
    const bodyStr = JSON.stringify({
      instId,
      tdMode: 'cash',
      side: req.side.toLowerCase(),
      ordType: 'market',
      // OKX spot market BUY defaults to sz in QUOTE currency; force base so sz is a coin quantity.
      tgtCcy: 'base_ccy',
      sz: quantity.toFixed(6),
    });
    const placed = await this.okxRequest('POST', '/api/v5/trade/order', bodyStr);
    const ordId: string = placed.data?.[0]?.ordId;
    if (!ordId) throw new Error('OKX did not return an order id');

    // Market orders fill almost immediately; poll the order record for the real average price, size and fee.
    let detail: any = null;
    for (let i = 0; i < 5 && !detail; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const d = await this.okxRequest('GET', `/api/v5/trade/order?instId=${instId}&ordId=${ordId}`, '');
        const o = d.data?.[0];
        if (o && o.state === 'filled' && parseFloat(o.accFillSz) > 0) detail = o;
      } catch {
        /* retry */
      }
    }
    if (!detail) {
      throw new Error(`OKX order ${ordId} was accepted but its fill could not be confirmed. CHECK THE EXCHANGE before trading further.`);
    }
    const fillQty = parseFloat(detail.accFillSz);
    const avgPx = parseFloat(detail.avgPx);
    if (!(avgPx > 0) || !(fillQty > 0)) {
      throw new Error(`OKX order ${ordId} has no confirmed fill price/size. CHECK THE EXCHANGE before trading further.`);
    }
    // OKX reports fee as a negative number in feeCcy (base asset for buys, quote for sells).
    const fee = Math.abs(parseFloat(detail.fee) || 0);
    const feeUsd = detail.feeCcy === baseAsset ? fee * avgPx : fee;
    const feeInBase = detail.feeCcy === baseAsset ? fee : 0;

    return {
      success: true,
      orderId: ordId,
      exchange: 'OKX (LIVE)',
      symbol: req.symbol,
      side: req.side,
      executedPrice: avgPx,
      quantity: req.side === 'BUY' ? fillQty - feeInBase : fillQty,
      notionalUsd: fillQty * avgPx,
      feeUsd,
      timestamp: Date.now(),
      isSimulated: false,
      rawResponse: detail,
    };
  }
}

/** Round DOWN to a multiple of `step` (rounding up could exceed the balance held). */
export function floorToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty;
  const n = Math.floor(qty / step + 1e-9);
  return Number((n * step).toFixed(decimalsOf(step)));
}

function decimalsOf(step: number): number {
  const str = step.toString();
  if (str.includes('e-')) return parseInt(str.split('e-')[1], 10);
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}
